<?php

namespace App\Support\Coach;

use App\Models\CoachMessage;
use App\Models\CoachProposal;
use App\Models\Skill;
use App\Models\User;
use App\Support\Progression;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The AI coach. It reads your Mayhem data, talks back, and suggests quests.
 *
 * It can never write to the database on its own: everything it suggests lands in
 * coach_proposals and only becomes a real quest when you press Accept.
 */
class QuestCoach
{
    /** How many earlier messages are sent back to the model as conversation history. */
    private const HISTORY = 12;

    private const MAX_PROPOSALS = 4;

    public function __construct(private CoachProvider $provider, private HunterContext $context) {}

    public function provider(): CoachProvider
    {
        return $this->provider;
    }

    /** Your own message, then the coach's answer. */
    public function chat(User $user, string $message): CoachMessage
    {
        $this->guardDailyLimit($user);

        CoachMessage::create(['user_id' => $user->id, 'role' => 'user', 'content' => $message, 'kind' => 'chat']);

        return $this->ask($user, 'chat');
    }

    /**
     * The briefing for today. Generated once per day, on the first visit, so a day
     * you never open the page costs nothing.
     */
    public function daily(User $user): CoachMessage
    {
        $existing = CoachMessage::where('user_id', $user->id)->where('kind', 'daily')
            ->whereDate('created_at', '>=', now()->startOfDay())->latest('id')->first();
        if ($existing) {
            return $existing;
        }

        $this->guardDailyLimit($user);

        CoachMessage::create([
            'user_id' => $user->id,
            'role' => 'user',
            'kind' => 'daily',
            'content' => 'Give me my briefing for today: how the last weeks went, what to watch out for, and the quests you think I need now.',
        ]);

        return $this->ask($user, 'daily');
    }

    // ---------------------------------------------------------------------

    private function ask(User $user, string $kind): CoachMessage
    {
        // One conversation at a time, so a double click can't spend two calls.
        $lock = Cache::lock("coach:{$user->id}", 90);
        if (! $lock->get()) {
            throw new CoachException('The coach is still thinking about your last message.', 409);
        }

        try {
            $history = CoachMessage::where('user_id', $user->id)->latest('id')->limit(self::HISTORY)->get()
                ->reverse()->map(fn ($m) => ['role' => $m->role, 'content' => $m->content])->values()->all();

            $answer = $this->provider->json($this->systemPrompt($user), $history, $this->schema());

            return DB::transaction(function () use ($user, $answer, $kind) {
                $reply = trim((string) ($answer['reply'] ?? ''));
                $message = CoachMessage::create([
                    'user_id' => $user->id,
                    'role' => 'coach',
                    'kind' => $kind,
                    'content' => $reply !== '' ? $reply : 'Here is what I suggest.',
                ]);

                foreach ($this->validProposals($user, $answer['quests'] ?? []) as $proposal) {
                    $message->proposals()->create($proposal + ['user_id' => $user->id]);
                }

                return $message->load('proposals.skill');
            });
        } finally {
            $lock->release();
        }
    }

    private function systemPrompt(User $user): string
    {
        $tiers = collect(Progression::TIER_XP)->map(fn ($xp, $t) => "$t = $xp XP")->implode(', ');

        return <<<PROMPT
        You are the System: the voice behind a Solo Leveling style app called Mayhem. You talk to one
        hunter about their real life and hand out quests that make them stronger.

        How to talk: direct, warm, a little dramatic, never fawning. Two to five sentences, no lists,
        no markdown. Speak to them as "you". If their data shows they are slipping, say so plainly and
        kindly. If they did well, name the specific thing they did.

        About quests you suggest:
        - Only suggest a quest when it adds something. Zero quests is a fine answer, four is the maximum.
        - Never suggest a quest they already have (the library is below). Build on what they do instead.
        - A quest must be something they can finish and tick off, phrased as an action: "Walk 30 minutes
          after dinner", not "Be healthier".
        - Tiers are how much it costs them: $tiers. E is a two-minute habit, C is a solid effort,
          S is rare and life-changing. Most quests should be E, D or C.
        - Every quest trains exactly one skill. Use the skill slugs listed below.
        - schedule_mode: "weekly" with weekdays (1 = Monday ... 7 = Sunday) for a habit, "date" with a
          date (YYYY-MM-DD, today or later) for a one-off on a day, "none" for a to-do with no day.
        - "reason" is one short sentence for the hunter, pointing at the data that made you suggest it.
        - Never repeat a quest you suggested earlier in this conversation.

        You cannot change anything yourself. The hunter accepts or rejects every quest you propose.
        Never claim you created, scheduled, completed or deleted anything.

        Everything below is the hunter's own data in Mayhem, as it is right now.

        {$this->context->build($user)}
        PROMPT;
    }

    private function schema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'reply' => ['type' => 'string', 'description' => 'What you say to the hunter.'],
                'quests' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'title' => ['type' => 'string'],
                            'description' => ['type' => 'string'],
                            'tier' => ['type' => 'string', 'enum' => array_keys(Progression::TIER_XP)],
                            'skill' => ['type' => 'string', 'enum' => Skill::orderBy('sort')->pluck('slug')->all()],
                            'schedule_mode' => ['type' => 'string', 'enum' => ['none', 'weekly', 'date']],
                            'weekdays' => ['type' => 'array', 'items' => ['type' => 'integer']],
                            'date' => ['type' => 'string'],
                            'reason' => ['type' => 'string'],
                        ],
                        'required' => ['title', 'description', 'tier', 'skill', 'schedule_mode', 'reason'],
                    ],
                ],
            ],
            'required' => ['reply', 'quests'],
        ];
    }

    /**
     * Whatever the model sends back is treated as a suggestion from a stranger: every field is
     * checked here, and anything that does not fit the rules is dropped.
     */
    private function validProposals(User $user, mixed $quests): array
    {
        if (! is_array($quests)) {
            return [];
        }

        $skills = Skill::pluck('id', 'slug');
        $taken = $user->tasks()->pluck('title')->map(fn ($t) => Str::lower(trim($t)))
            ->merge(CoachProposal::where('user_id', $user->id)->where('status', '!=', 'dismissed')
                ->pluck('title')->map(fn ($t) => Str::lower(trim($t))))
            ->flip();

        $out = [];
        foreach ($quests as $q) {
            if (! is_array($q) || count($out) >= self::MAX_PROPOSALS) {
                continue;
            }
            $title = Str::limit(trim((string) ($q['title'] ?? '')), 118);
            $tier = strtoupper((string) ($q['tier'] ?? ''));
            if ($title === '' || ! isset(Progression::TIER_XP[$tier]) || $taken->has(Str::lower($title))) {
                continue;
            }
            $taken[Str::lower($title)] = true;

            $out[] = [
                'title' => $title,
                'description' => Str::limit(trim((string) ($q['description'] ?? '')), 990) ?: null,
                'tier' => $tier,
                'reason' => Str::limit(trim((string) ($q['reason'] ?? '')), 290) ?: null,
                'skill_id' => $skills[(string) ($q['skill'] ?? '')] ?? $skills['discipline'] ?? null,
                'schedule' => $this->validSchedule($q),
            ];
        }

        return $out;
    }

    private function validSchedule(array $q): array
    {
        $mode = (string) ($q['schedule_mode'] ?? 'none');

        if ($mode === 'weekly') {
            $days = collect($q['weekdays'] ?? [])->map(fn ($d) => (int) $d)
                ->filter(fn ($d) => $d >= 1 && $d <= 7)->unique()->sort()->values()->all();

            return $days ? ['mode' => 'weekly', 'days' => $days] : ['mode' => 'none'];
        }

        if ($mode === 'date') {
            $date = (string) ($q['date'] ?? '');
            $parsed = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? Carbon::parse($date)->startOfDay() : null;

            // a date in the past is a mistake, not a plan
            return $parsed && $parsed->gte(now()->startOfDay()) ? ['mode' => 'date', 'date' => $date] : ['mode' => 'none'];
        }

        return ['mode' => 'none'];
    }

    private function guardDailyLimit(User $user): void
    {
        $limit = (int) config('services.coach.daily_messages');
        $used = CoachMessage::where('user_id', $user->id)->where('role', 'user')
            ->whereDate('created_at', '>=', now()->startOfDay())->count();

        if ($used >= $limit) {
            throw new CoachException("That is your {$limit} coach messages for today. The coach is back tomorrow.", 429);
        }
    }
}
