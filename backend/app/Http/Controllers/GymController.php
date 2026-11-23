<?php

namespace App\Http\Controllers;

use App\Models\Exercise;
use App\Models\ExerciseLog;
use App\Support\AchievementEngine;
use App\Support\GymPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class GymController extends Controller
{
    /** Everything the gym page (and the dashboard figure) needs in one request. */
    public function index(Request $request, GymPlanner $planner): JsonResponse
    {
        return response()->json($this->payload($request, $planner));
    }

    public function store(Request $request, GymPlanner $planner): JsonResponse
    {
        $exercise = $request->user()->exercises()->create($this->validated($request));

        return response()->json(['id' => $exercise->id] + $this->payload($request, $planner), 201);
    }

    public function update(Request $request, GymPlanner $planner, int $exerciseId): JsonResponse
    {
        $exercise = $request->user()->exercises()->findOrFail($exerciseId);
        $exercise->update($this->validated($request));

        return response()->json($this->payload($request, $planner));
    }

    public function destroy(Request $request, GymPlanner $planner, int $exerciseId): JsonResponse
    {
        // Soft delete: the exercise leaves your list, but its logged sessions still count.
        $request->user()->exercises()->findOrFail($exerciseId)->delete();

        return response()->json($this->payload($request, $planner));
    }

    /** Record the weight you lifted. One entry per exercise per day (logging again edits it). */
    public function log(Request $request, GymPlanner $planner, AchievementEngine $engine, int $exerciseId): JsonResponse
    {
        $exercise = $request->user()->exercises()->findOrFail($exerciseId);
        $data = $request->validate([
            'weight' => ['required', 'numeric', 'min:0', 'max:1000'],
            'sets' => ['nullable', 'integer', 'between:1,50'],
            'reps' => ['nullable', 'integer', 'between:1,500'],
            'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
        ]);

        $date = $data['date'] ?? now()->toDateString();

        $exercise->logs()->updateOrCreate(
            ['date' => $date],
            ['user_id' => $request->user()->id, 'weight' => $data['weight'], 'sets' => $data['sets'] ?? null, 'reps' => $data['reps'] ?? null],
        );

        return response()->json(['unlocked' => $engine->evaluate($request->user())] + $this->payload($request, $planner));
    }

    public function destroyLog(Request $request, GymPlanner $planner, int $logId): JsonResponse
    {
        ExerciseLog::where('user_id', $request->user()->id)->findOrFail($logId)->delete();

        return response()->json($this->payload($request, $planner));
    }

    /** One click to get a sensible 6-day push/pull/legs plan you can then edit freely. */
    public function starter(Request $request, GymPlanner $planner): JsonResponse
    {
        $user = $request->user();
        if ($user->exercises()->exists()) {
            return response()->json(['message' => 'You already have exercises.'], 422);
        }

        $plan = [
            ['Bench press', 'chest', [1, 4]], ['Incline dumbbell press', 'chest', [1]],
            ['Overhead press', 'shoulders', [1, 4]], ['Lateral raise', 'shoulders', [1, 4]],
            ['Triceps pushdown', 'arms', [1, 4]],
            ['Barbell row', 'back', [2, 5]], ['Lat pulldown', 'back', [2, 5]],
            ['Biceps curl', 'arms', [2, 5]],
            ['Squat', 'legs', [3, 6]], ['Romanian deadlift', 'legs', [3, 6]],
            ['Leg press', 'legs', [3]], ['Plank', 'core', [3, 6]],
            ['Running', 'cardio', [7]],
        ];

        foreach ($plan as [$name, $part, $days]) {
            $user->exercises()->create(['name' => $name, 'body_part' => $part, 'weekdays' => $days]);
        }

        return response()->json($this->payload($request, $planner), 201);
    }

    // ---------------------------------------------------------------------

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'body_part' => ['required', Rule::in(Exercise::BODY_PARTS)],
            'weekdays' => ['nullable', 'array', 'max:7'],
            'weekdays.*' => ['integer', 'between:1,7', 'distinct'],
            'goal_weight' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'goal_date' => ['nullable', 'date_format:Y-m-d', 'required_with:goal_weight'],
        ]);

        $data['weekdays'] = collect($data['weekdays'] ?? [])->map(fn ($d) => (int) $d)->sort()->values()->all();
        $data['goal_weight'] = $data['goal_weight'] ?? null;
        $data['goal_date'] = $data['goal_weight'] === null ? null : ($data['goal_date'] ?? null);

        return $data;
    }

    private function payload(Request $request, GymPlanner $planner): array
    {
        $user = $request->user();
        $weekStart = now()->startOfWeek()->startOfDay();

        $exercises = $user->exercises()->orderBy('id')->get();
        $allLogs = ExerciseLog::where('user_id', $user->id)->orderBy('date')->get();
        $byExercise = $allLogs->groupBy('exercise_id');
        $sessions = $allLogs->pluck('date')->map(fn ($d) => $d->toDateString())->unique()->count();
        $week = $planner->days($user, $weekStart, 7);

        $records = 0;
        $list = $exercises->map(function (Exercise $e) use ($byExercise, &$records) {
            $logs = $byExercise->get($e->id, collect());
            $row = $this->present($e, $logs);
            $records += $row['records'];

            return $row;
        })->values();

        return [
            'week' => ['start' => $weekStart->toDateString(), 'days' => array_values($week)],
            'exercises' => $list,
            'physique' => GymPlanner::physique($sessions),
            'stats' => [
                'sessions' => $sessions,
                'sessions_this_week' => collect($week)->where('trained', true)->count(),
                'records' => $records,
                'body_parts' => Exercise::BODY_PARTS,
            ],
        ];
    }

    /** @param Collection<int, ExerciseLog> $logs oldest first */
    private function present(Exercise $e, Collection $logs): array
    {
        $current = $logs->last();
        $previous = $logs->count() > 1 ? $logs[$logs->count() - 2] : null;
        $first = $logs->first();

        // Count how many times you beat your previous best (excluding the very first log).
        $records = 0;
        $best = null;
        foreach ($logs as $l) {
            if ($best !== null && $l->weight > $best) {
                $records++;
            }
            $best = max($best ?? $l->weight, $l->weight);
        }

        $goalPct = null;
        if ($e->goal_weight !== null) {
            $base = $first?->weight ?? 0.0;
            $now = $current?->weight ?? 0.0;
            $goalPct = $e->goal_weight <= $base
                ? ($now >= $e->goal_weight ? 100 : 0)
                : (int) max(0, min(100, floor(($now - $base) / ($e->goal_weight - $base) * 100)));
            if ($now >= $e->goal_weight && $current) {
                $goalPct = 100;
            }
        }

        return [
            'id' => $e->id,
            'name' => $e->name,
            'body_part' => $e->body_part,
            'weekdays' => $e->weekdays ?? [],
            'goal' => $e->goal_weight === null ? null : [
                'weight' => $e->goal_weight,
                'date' => $e->goal_date?->toDateString(),
                'pct' => $goalPct,
                'reached' => $current !== null && $current->weight >= $e->goal_weight,
                'days_left' => $e->goal_date ? (int) now()->startOfDay()->diffInDays($e->goal_date, false) : null,
            ],
            'current' => $current ? ['id' => $current->id, 'weight' => $current->weight, 'sets' => $current->sets, 'reps' => $current->reps, 'date' => $current->date->toDateString()] : null,
            'previous' => $previous ? ['weight' => $previous->weight, 'date' => $previous->date->toDateString()] : null,
            'change' => $current && $previous ? round($current->weight - $previous->weight, 2) : null,
            'best' => $logs->max('weight'),
            'logged_today' => $current !== null && $current->date->isSameDay(now()),
            'history' => $logs->slice(-12)->map(fn ($l) => ['id' => $l->id, 'date' => $l->date->toDateString(), 'weight' => $l->weight, 'sets' => $l->sets, 'reps' => $l->reps])->values()->all(),
            'records' => $records,
        ];
    }
}
