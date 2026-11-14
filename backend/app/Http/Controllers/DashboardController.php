<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\Achievement;
use App\Models\Task;
use App\Support\Progression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    private const ACTIVITY_DAYS = 14;

    /** One request that powers the whole dashboard page. */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $tasks = $user->tasks()->with('achievement')->get();
        $completed = $tasks->whereNotNull('completed_at');

        return response()->json([
            'user' => new UserResource($user),
            'stats' => [
                'total' => $tasks->count(),
                'completed' => $completed->count(),
                'pending' => $tasks->count() - $completed->count(),
                'completion_rate' => $tasks->count() ? (int) round($completed->count() / $tasks->count() * 100) : 0,
                'streak' => $this->streak($completed),
                'achievements_unlocked' => $user->achievements()->count(),
            ],
            'tiers' => collect(array_keys(Progression::TIER_XP))->map(fn ($tier) => [
                'tier' => $tier,
                'total' => $tasks->where('tier', $tier)->count(),
                'completed' => $completed->where('tier', $tier)->count(),
            ])->values(),
            'activity' => $this->activity($completed),
            'achievements' => $this->achievements($user, $tasks),
        ]);
    }

    /** Completed tasks + XP for each of the last N days (oldest first), zero-filled. */
    private function activity($completed): array
    {
        $byDay = $completed->groupBy(fn (Task $t) => $t->completed_at->toDateString());

        return collect(range(self::ACTIVITY_DAYS - 1, 0))->map(function ($daysAgo) use ($byDay) {
            $date = now()->subDays($daysAgo)->toDateString();
            $day = $byDay->get($date, collect());

            return ['date' => $date, 'completed' => $day->count(), 'xp' => (int) $day->sum('xp')];
        })->all();
    }

    /** Consecutive days with at least one completion. Today may still be empty. */
    private function streak($completed): int
    {
        $days = $completed->map(fn (Task $t) => $t->completed_at->toDateString())->unique()->flip();

        $cursor = now();
        if (! $days->has($cursor->toDateString())) {
            $cursor = $cursor->subDay();
        }

        $streak = 0;
        while ($days->has($cursor->toDateString())) {
            $streak++;
            $cursor = $cursor->subDay();
        }

        return $streak;
    }

    /** Whole catalog, with unlocked state and "how far along" from the user's linked tasks. */
    private function achievements($user, $tasks): array
    {
        $unlocked = $user->achievements()->get()->keyBy('id');

        return Achievement::orderBy('id')->get()->map(function (Achievement $a) use ($unlocked, $tasks) {
            $linked = $tasks->where('achievement_id', $a->id);
            $done = $linked->whereNotNull('completed_at')->count();
            $isUnlocked = $unlocked->has($a->id);

            return [
                'id' => $a->id,
                'name' => $a->name,
                'description' => $a->description,
                'icon' => $a->icon,
                'tier' => $a->tier,
                'unlocked' => $isUnlocked,
                'unlocked_at' => $isUnlocked ? \Illuminate\Support\Carbon::parse($unlocked[$a->id]->pivot->unlocked_at)->toIso8601String() : null,
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
