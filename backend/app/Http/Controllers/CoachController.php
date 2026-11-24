<?php

namespace App\Http\Controllers;

use App\Http\Resources\TaskResource;
use App\Models\CoachMessage;
use App\Models\CoachProposal;
use App\Support\Coach\CoachException;
use App\Support\Coach\QuestCoach;
use App\Support\Progression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CoachController extends Controller
{
    /** The whole conversation, plus what is left of today's allowance. */
    public function index(Request $request, QuestCoach $coach): JsonResponse
    {
        return response()->json($this->payload($request, $coach));
    }

    public function profile(Request $request, QuestCoach $coach): JsonResponse
    {
        $data = $request->validate(['profile' => ['nullable', 'string', 'max:4000']]);
        $request->user()->forceFill(['coach_profile' => $data['profile'] ?? null])->save();

        return response()->json($this->payload($request, $coach));
    }

    public function message(Request $request, QuestCoach $coach): JsonResponse
    {
        $data = $request->validate(['message' => ['required', 'string', 'max:2000']]);

        return $this->run($request, $coach, fn () => $coach->chat($request->user(), trim($data['message'])));
    }

    /** Today's briefing. Calling it twice in a day gives you the same answer, free. */
    public function daily(Request $request, QuestCoach $coach): JsonResponse
    {
        return $this->run($request, $coach, fn () => $coach->daily($request->user()));
    }

    /** Turn a suggestion into a real quest. */
    public function accept(Request $request, QuestCoach $coach, int $proposalId): JsonResponse
    {
        $user = $request->user();
        $proposal = CoachProposal::where('user_id', $user->id)->findOrFail($proposalId);

        if ($proposal->status !== 'pending') {
            return response()->json(['message' => 'That suggestion was already handled.'], 422);
        }

        $limit = (int) config('services.coach.daily_quests');
        $used = CoachProposal::where('user_id', $user->id)->where('status', 'accepted')
            ->whereDate('updated_at', '>=', now()->startOfDay())->count();
        if ($used >= $limit) {
            return response()->json(['message' => "You have accepted {$limit} coach quests today. Finish those first."], 429);
        }

        $task = $user->tasks()->create([
            'title' => $proposal->title,
            'description' => $proposal->description,
            'tier' => $proposal->tier,
            'skill_id' => $proposal->skill_id,
            'xp' => Progression::TIER_XP[$proposal->tier],
        ]);
        $task->applySchedule($proposal->schedule);

        $proposal->update(['status' => 'accepted', 'task_id' => $task->id]);

        return response()->json([
            'task' => new TaskResource($task->load(['achievement:id,name,icon', 'skill:id,slug,name,icon'])->loadCount('completions')),
        ] + $this->payload($request, $coach));
    }

    public function dismiss(Request $request, QuestCoach $coach, int $proposalId): JsonResponse
    {
        $proposal = CoachProposal::where('user_id', $request->user()->id)->findOrFail($proposalId);
        if ($proposal->status === 'pending') {
            $proposal->update(['status' => 'dismissed']);
        }

        return response()->json($this->payload($request, $coach));
    }

    /** Start over. Quests you already accepted stay where they are. */
    public function clear(Request $request, QuestCoach $coach): JsonResponse
    {
        CoachMessage::where('user_id', $request->user()->id)->delete();

        return response()->json($this->payload($request, $coach));
    }

    // ---------------------------------------------------------------------

    private function run(Request $request, QuestCoach $coach, callable $fn): JsonResponse
    {
        try {
            $fn();
        } catch (CoachException $e) {
            return response()->json(['message' => $e->getMessage()] + $this->payload($request, $coach), $e->status);
        }

        return response()->json($this->payload($request, $coach));
    }

    private function payload(Request $request, QuestCoach $coach): array
    {
        $user = $request->user();
        $messages = CoachMessage::where('user_id', $user->id)->with('proposals.skill')->latest('id')->limit(40)->get()->reverse()->values();

        $usedMessages = CoachMessage::where('user_id', $user->id)->where('role', 'user')
            ->whereDate('created_at', '>=', now()->startOfDay())->count();
        $usedQuests = CoachProposal::where('user_id', $user->id)->where('status', 'accepted')
            ->whereDate('updated_at', '>=', now()->startOfDay())->count();

        return [
            'configured' => $coach->provider()->configured(),
            'provider' => $coach->provider()->label(),
            'profile' => $user->coach_profile,
            'has_daily' => CoachMessage::where('user_id', $user->id)->where('kind', 'daily')->where('role', 'coach')
                ->whereDate('created_at', '>=', now()->startOfDay())->exists(),
            'limits' => [
                'messages' => ['used' => $usedMessages, 'max' => (int) config('services.coach.daily_messages')],
                'quests' => ['used' => $usedQuests, 'max' => (int) config('services.coach.daily_quests')],
            ],
            'messages' => $messages->map(fn (CoachMessage $m) => [
                'id' => $m->id,
                'role' => $m->role,
                'kind' => $m->kind,
                'content' => $m->content,
                'at' => $m->created_at->toIso8601String(),
                'proposals' => $m->proposals->map(fn (CoachProposal $p) => $p->present())->values(),
            ])->values(),
        ];
    }
}
