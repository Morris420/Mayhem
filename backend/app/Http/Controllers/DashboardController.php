<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\Achievement;
use App\Models\TaskCompletion;
use App\Models\User;
use App\Support\Progression;
use App\Support\QuestPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    private const ACTIVITY_DAYS = 14;

    /** One request that powers the whole dashboard page. */
    public function show(Request $request, QuestPlanner $planner): JsonResponse
    {
        $user = $request->user();
        $today = now()->startOfDay();

        $completions = TaskCompletion::where('user_id', $user->id)->get(['task_id', 'date', 'xp']);
        $byDate = $completions->groupBy(fn ($c) => $c->date->toDateString());
        $todayPlan = $planner->range($user, $today, 1)[0];
        $achievements = $this->achievements($user);

        return response()->json([
            'user' => new UserResource($user),
            'today' => $todayPlan,
            'stats' => [
                'quests' => $user->tasks()->count(),
                'completions' => $completions->count(),
                'streak' => $this->streak($byDate, $today),
                'week_xp' => (int) $completions->filter(fn ($c) => $c->date->gte($today->copy()->subDays(6)))->sum('xp'),
                'achievements_unlocked' => collect($achievements)->where('unlocked', true)->count(),
                'achievements_total' => count($achievements),
            ],
            'tiers' => $this->tiers($user),
            'activity' => $this->activity($byDate, $today),
            'achievements' => $achievements,
        ]);
    }

    /** Completed quests + XP for each of the last N days (oldest first), zero-filled. */
    private function activity($byDate, Carbon $today): array
    {
        return collect(range(self::ACTIVITY_DAYS - 1, 0))->map(function ($daysAgo) use ($byDate, $today) {
            $date = $today->copy()->subDays($daysAgo)->toDateString();
            $day = $byDate->get($date, collect());

            return ['date' => $date, 'completed' => $day->count(), 'xp' => (int) $day->sum('xp')];
        })->all();
    }

    /** Consecutive days with at least one completion. Today may still be empty. */
    private function streak($byDate, Carbon $today): int
    {
        $cursor = $today->copy();
        if (! $byDate->has($cursor->toDateString())) {
            $cursor->subDay();
        }

        $streak = 0;
        while ($byDate->has($cursor->toDateString())) {
            $streak++;
            $cursor->subDay();
        }

        return $streak;
    }

    /** How many times quests of each tier have been completed (deleted quests still count). */
    private function tiers(User $user): array
    {
        $quests = $user->tasks()->withTrashed()->withCount('completions')->get();

        return collect(array_keys(Progression::TIER_XP))->map(fn ($tier) => [
            'tier' => $tier,
            'quests' => $quests->where('tier', $tier)->whereNull('deleted_at')->count(),
            'completions' => (int) $quests->where('tier', $tier)->sum('completions_count'),
        ])->values()->all();
    }

    /** Catalog with unlocked state and "how far along" from the quests you linked to each. */
    private function achievements(User $user): array
    {
        $unlocked = $user->achievements()->get()->keyBy('id');
        $tasks = $user->tasks()->whereNotNull('achievement_id')->withCount('completions')->get()->groupBy('achievement_id');

        return Achievement::visibleTo($user)->orderBy('id')->get()->map(function (Achievement $a) use ($unlocked, $tasks) {
            $linked = $tasks->get($a->id, collect());
            $done = $linked->where('completions_count', '>', 0)->count();
            $isUnlocked = $unlocked->has($a->id);

            return [
                'id' => $a->id,
                'name' => $a->name,
                'description' => $a->description,
                'icon' => $a->icon,
                'tier' => $a->tier,
                'custom' => $a->isCustom(),
                'unlocked' => $isUnlocked,
                'unlocked_at' => $isUnlocked ? Carbon::parse($unlocked[$a->id]->pivot->unlocked_at)->toIso8601String() : null,
                'linked_tasks' => $linked->count(),
                'progress' => [
                    'done' => $done,
                    'total' => $linked->count(),
                    'pct' => $isUnlocked ? 100 : ($linked->count() ? (int) floor($done / $linked->count() * 100) : 0),
                ],
            ];
        })->all();
    }
}
