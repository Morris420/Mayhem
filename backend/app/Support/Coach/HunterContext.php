<?php

namespace App\Support\Coach;

use App\Models\Achievement;
use App\Models\BriefcaseItem;
use App\Models\ExerciseLog;
use App\Models\Task;
use App\Models\TaskCompletion;
use App\Models\User;
use App\Support\DietRules;
use App\Support\GymPlanner;
use App\Support\Progression;
use App\Support\QuestPlanner;
use App\Support\SkillService;
use Illuminate\Support\Carbon;

/**
 * Everything the coach is allowed to see, as one compact block of text.
 *
 * Google Calendar is deliberately left out: those events are other people's meetings and
 * holidays, and they only confuse the suggestions. Briefcase files are named but never read.
 */
class HunterContext
{
    private const DAYS_OF_HISTORY = 21;

    private const WEEKDAYS = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'];

    public function __construct(
        private QuestPlanner $planner,
        private GymPlanner $gym,
        private SkillService $skills,
    ) {}

    public function build(User $user): string
    {
        $today = now()->startOfDay();

        return collect([
            $this->hunter($user, $today),
            $this->skillLines($user),
            $this->questLibrary($user, $today),
            $this->week($user, $today),
            $this->history($user, $today),
            $this->gymBlock($user),
            $this->nutrition($user),
            $this->achievements($user),
            $this->briefcase($user),
        ])->filter()->implode("\n\n");
    }

    private function hunter(User $user, Carbon $today): string
    {
        $p = Progression::summary($user->xp);
        $profile = trim((string) $user->coach_profile);

        return "## The hunter\n"
            ."Name: {$user->username}. Today is ".$today->isoFormat('dddd D MMMM YYYY').".\n"
            ."Level {$p['level']} ({$p['rank']}-rank, \"{$p['title']}\"), {$user->xp} XP in total.\n"
            .'Joined '.$user->created_at->toDateString().".\n"
            .'What they told you about themselves: '.($profile !== '' ? $profile : '(nothing yet - ask them)');
    }

    private function skillLines(User $user): string
    {
        $lines = collect($this->skills->overview($user))
            ->map(fn ($s) => "- {$s['name']} (slug: {$s['slug']}): level {$s['level']}, {$s['xp']} XP"
                .($s['needed'] ? ", {$s['into']}/{$s['needed']} to the next level" : ''))
            ->implode("\n");

        return "## Skills (these are the slugs you must use for a quest)\n".$lines;
    }

    private function questLibrary(User $user, Carbon $today): string
    {
        $tasks = $user->tasks()->with('skill:id,slug')->withCount('completions')->latest('id')->limit(60)->get();
        if ($tasks->isEmpty()) {
            return "## Quest library\n(empty - they have no quests yet)";
        }

        $last = TaskCompletion::where('user_id', $user->id)
            ->selectRaw('task_id, MAX(date) as last_date')->groupBy('task_id')->pluck('last_date', 'task_id');

        $lines = $tasks->map(function (Task $t) use ($last, $today) {
            $when = match ($t->scheduleMode()) {
                'weekly' => 'every '.collect($t->recurrence)->map(fn ($d) => self::WEEKDAYS[$d])->implode('/'),
                'date' => 'on '.$t->scheduled_date->toDateString(),
                default => 'no fixed day',
            };
            $lastDate = $last[$t->id] ?? null;
            $ago = $lastDate ? Carbon::parse($lastDate)->startOfDay()->diffInDays($today).' days ago' : 'never';

            return "- [{$t->tier}] {$t->title} ({$when}; skill: ".($t->skill?->slug ?? 'discipline')
                ."; done {$t->completions_count}x, last {$ago})";
        })->implode("\n");

        return "## Quest library (do not propose one they already have)\n".$lines;
    }

    private function week(User $user, Carbon $today): string
    {
        $days = $this->planner->range($user, $today, 7);
        $lines = collect($days)->map(function ($day) {
            $items = collect($day['items'])->map(fn ($i) => $i['title'].($i['done'] ? ' (done)' : ''))->implode(', ');

            return '- '.Carbon::parse($day['date'])->isoFormat('ddd D MMM').': '.($items !== '' ? $items : 'nothing planned');
        })->implode("\n");

        return "## The next 7 days\n".$lines;
    }

    private function history(User $user, Carbon $today): string
    {
        $from = $today->copy()->subDays(self::DAYS_OF_HISTORY);
        $rows = TaskCompletion::where('task_completions.user_id', $user->id)
            ->whereDate('task_completions.date', '>=', $from->toDateString())
            ->join('tasks', 'tasks.id', '=', 'task_completions.task_id')
            ->get(['task_completions.date', 'tasks.title'])
            ->groupBy(fn ($c) => $c->date->toDateString());

        if ($rows->isEmpty()) {
            return '## The last '.self::DAYS_OF_HISTORY." days\nNo quests completed at all.";
        }

        $lines = collect(range(self::DAYS_OF_HISTORY - 1, 0))->map(function ($ago) use ($rows, $today) {
            $date = $today->copy()->subDays($ago);
            $day = $rows->get($date->toDateString());

            return '- '.$date->isoFormat('ddd D MMM').': '.($day ? $day->pluck('title')->implode(', ') : 'nothing');
        })->implode("\n");

        return '## Completed in the last '.self::DAYS_OF_HISTORY." days\n".$lines;
    }

    private function gymBlock(User $user): string
    {
        $exercises = $user->exercises()->get();
        if ($exercises->isEmpty()) {
            return "## Gym\nNo exercises set up.";
        }

        $logs = ExerciseLog::where('user_id', $user->id)->orderByDesc('date')->limit(80)->get();
        $byExercise = $logs->groupBy('exercise_id');
        $sessions = $logs->pluck('date')->map(fn ($d) => $d->toDateString())->unique()->count();
        $physique = GymPlanner::physique($sessions);

        $lines = $exercises->map(function ($e) use ($byExercise) {
            $mine = $byExercise->get($e->id, collect());
            $best = $mine->max('weight');
            $latest = $mine->first();
            $days = $e->weekdays ? collect($e->weekdays)->map(fn ($d) => self::WEEKDAYS[$d])->implode('/') : 'no fixed day';

            return "- {$e->name} ({$e->body_part}, {$days}): best {$best}kg"
                .($latest ? ", last {$latest->weight}kg on ".$latest->date->toDateString() : ', never logged')
                .($e->goal_weight ? ", goal {$e->goal_weight}kg" : '');
        })->implode("\n");

        return "## Gym\nTraining days logged: {$sessions} (physique stage: {$physique['name']}).\n".$lines;
    }

    private function nutrition(User $user): string
    {
        $perDay = DietRules::perDay($user)->take(-10);
        $head = "## Nutrition\nGoals: {$user->kcal_goal} kcal, {$user->protein_goal} g protein per day.";
        if ($perDay->isEmpty()) {
            return $head."\nNothing logged yet.";
        }

        $lines = $perDay->map(fn ($d, $date) => '- '.$date.': '.round($d['kcal']).' kcal, '.round($d['protein']).' g protein'
            .($d['ok'] ? ' (on target)' : ''))->implode("\n");

        return $head."\nLast logged days:\n".$lines;
    }

    private function achievements(User $user): string
    {
        $unlocked = $user->achievements()->pluck('name');
        $locked = Achievement::visibleTo($user)->whereNotIn('id', $user->achievements()->pluck('achievements.id'))
            ->limit(20)->pluck('name');

        return "## Achievements\nUnlocked: ".($unlocked->isNotEmpty() ? $unlocked->implode(', ') : 'none yet')
            ."\nStill locked: ".($locked->isNotEmpty() ? $locked->implode(', ') : 'none');
    }

    private function briefcase(User $user): string
    {
        $names = BriefcaseItem::where('user_id', $user->id)->where('kind', '!=', 'folder')->limit(30)->pluck('name');
        if ($names->isEmpty()) {
            return '';
        }

        // Names only. The coach never sees what is inside a file.
        return "## Briefcase (file names only)\n".$names->implode(', ');
    }
}
