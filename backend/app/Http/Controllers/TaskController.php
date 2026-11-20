<?php

namespace App\Http\Controllers;

use App\Http\Resources\TaskResource;
use App\Http\Resources\UserResource;
use App\Models\Task;
use App\Support\Progression;
use App\Support\QuestPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    /** The quest library: every quest you have made, with how it is scheduled. */
    public function index(Request $request)
    {
        $tasks = $request->user()->tasks()
            ->with('achievement:id,name,icon')
            ->withCount('completions')
            ->latest('id')
            ->get();

        return TaskResource::collection($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request));

        $task = $request->user()->tasks()->create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'tier' => $data['tier'],
            'achievement_id' => $data['achievement_id'] ?? null,
            // XP is decided here, never by the client, so it can't be tampered with.
            'xp' => Progression::TIER_XP[$data['tier']],
        ]);

        $this->applySchedule($task, $data['schedule'] ?? null);

        return (new TaskResource($task->load('achievement:id,name,icon')->loadCount('completions')))
            ->response()->setStatusCode(201);
    }

    /** Edit a quest. Changing the tier changes the XP of *future* completions only. */
    public function update(Request $request, int $taskId): TaskResource
    {
        $task = $request->user()->tasks()->findOrFail($taskId);
        $data = $request->validate($this->rules($request));

        $task->update([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'tier' => $data['tier'],
            'achievement_id' => $data['achievement_id'] ?? null,
            'xp' => Progression::TIER_XP[$data['tier']],
        ]);

        if (array_key_exists('schedule', $data)) {
            $this->applySchedule($task, $data['schedule']);
        }

        return new TaskResource($task->load('achievement:id,name,icon')->loadCount('completions'));
    }

    /** Assign an existing quest to a date, to weekdays, or clear its schedule. */
    public function schedule(Request $request, int $taskId): TaskResource
    {
        $task = $request->user()->tasks()->findOrFail($taskId);
        $data = $request->validate($this->scheduleRules('') + ['mode' => ['required']]);

        $this->applySchedule($task, $data);

        return new TaskResource($task->load('achievement:id,name,icon')->loadCount('completions'));
    }

    /**
     * Finish a quest for today: award XP, then unlock its achievement once every
     * quest linked to that achievement has been completed at least once.
     */
    public function complete(Request $request, int $taskId): JsonResponse
    {
        $user = $request->user();
        $task = $user->tasks()->with('achievement')->findOrFail($taskId);
        $today = now()->startOfDay();

        if ($task->isRecurring() && ! $task->occursOn($today)) {
            return response()->json(['message' => 'This quest is not scheduled for today.'], 422);
        }

        $result = DB::transaction(function () use ($user, $task, $today) {
            $already = $task->isRecurring()
                ? $task->completions()->whereDate('date', $today->toDateString())->exists()
                : $task->completions()->exists();

            if ($already) {
                return ['leveled_up' => false, 'unlocked' => null, 'awarded' => 0];
            }

            $levelBefore = Progression::levelForXp($user->xp);

            $task->completions()->create([
                'user_id' => $user->id,
                'date' => $today->toDateString(),
                'xp' => $task->xp,
                'completed_at' => now(),
            ]);
            $user->increment('xp', $task->xp);
            $user->refresh();

            $unlocked = null;
            if ($task->achievement_id) {
                $remaining = $user->tasks()
                    ->where('achievement_id', $task->achievement_id)
                    ->whereDoesntHave('completions')
                    ->exists();
                $alreadyHas = $user->achievements()->whereKey($task->achievement_id)->exists();

                if (! $remaining && ! $alreadyHas) {
                    $user->achievements()->attach($task->achievement_id, ['unlocked_at' => now()]);
                    $unlocked = $task->achievement->only(['id', 'name', 'description', 'icon']);
                }
            }

            return [
                'leveled_up' => Progression::levelForXp($user->xp) > $levelBefore,
                'unlocked' => $unlocked,
                'awarded' => $task->xp,
            ];
        });

        return response()->json([
            'task' => ['id' => $task->id, 'title' => $task->title, 'tier' => $task->tier, 'xp' => $task->xp],
            'user' => new UserResource($user->fresh()),
            ...$result,
        ]);
    }

    public function destroy(Request $request, int $taskId): JsonResponse
    {
        // Soft delete: the quest disappears from lists, but past XP/history stays.
        $request->user()->tasks()->findOrFail($taskId)->delete();

        return response()->json(['message' => 'Quest deleted']);
    }

    // ---------------------------------------------------------------------

    private function rules(Request $request): array
    {
        $user = $request->user();

        return [
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'tier' => ['required', Rule::in(array_keys(Progression::TIER_XP))],
            'achievement_id' => ['nullable', 'integer', Rule::exists('achievements', 'id')
                ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))],
        ] + $this->scheduleRules('schedule.');
    }

    /** $prefix is 'schedule.' when nested inside a quest payload, '' for the dedicated endpoint. */
    private function scheduleRules(string $prefix): array
    {
        $rules = [
            "{$prefix}mode" => [$prefix ? 'required_with:schedule' : 'required', Rule::in(['none', 'date', 'weekly'])],
            "{$prefix}date" => ['nullable', "required_if:{$prefix}mode,date", 'date_format:Y-m-d'],
            "{$prefix}days" => ['nullable', "required_if:{$prefix}mode,weekly", 'array', 'min:1', 'max:7'],
            "{$prefix}days.*" => ['integer', 'between:1,7', 'distinct'],
        ];

        return $prefix ? ['schedule' => ['nullable', 'array']] + $rules : $rules;
    }

    private function applySchedule(Task $task, ?array $schedule): void
    {
        if ($schedule === null) {
            return;
        }

        $wasRecurring = $task->isRecurring();

        match ($schedule['mode']) {
            'weekly' => $task->forceFill([
                'recurrence' => collect($schedule['days'])->map(fn ($d) => (int) $d)->unique()->sort()->values()->all(),
                'scheduled_date' => null,
                // keep the original start when only the weekdays change
                'starts_on' => $wasRecurring ? $task->starts_on : now()->startOfDay(),
            ]),
            'date' => $task->forceFill(['recurrence' => null, 'scheduled_date' => $schedule['date'], 'starts_on' => null]),
            default => $task->forceFill(['recurrence' => null, 'scheduled_date' => null, 'starts_on' => null]),
        };

        $task->save();
    }
}
