<?php

namespace App\Http\Controllers;

use App\Http\Resources\TaskResource;
use App\Http\Resources\UserResource;
use App\Models\Task;
use App\Support\Progression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $tasks = $request->user()->tasks()
            ->with('achievement')
            ->orderByRaw('completed_at IS NOT NULL') // pending first
            ->latest('id')
            ->get();

        return TaskResource::collection($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'tier' => ['required', Rule::in(array_keys(Progression::TIER_XP))],
            'achievement_id' => ['nullable', 'integer', 'exists:achievements,id'],
        ]);

        $task = $request->user()->tasks()->create([
            ...$data,
            // XP is decided here, never by the client, so it can't be tampered with.
            'xp' => Progression::TIER_XP[$data['tier']],
        ]);

        return (new TaskResource($task->load('achievement')))->response()->setStatusCode(201);
    }

    /**
     * Mark a task as done: award XP, then unlock the linked achievement if
     * every task the user linked to it is now complete.
     */
    public function complete(Request $request, int $taskId): JsonResponse
    {
        $user = $request->user();
        // Scoped to the current user: someone else's task id just 404s.
        $task = $user->tasks()->with('achievement')->findOrFail($taskId);

        $result = DB::transaction(function () use ($user, $task) {
            if ($task->isCompleted()) {
                return ['leveled_up' => false, 'unlocked' => null];
            }

            $levelBefore = Progression::levelForXp($user->xp);

            $task->update(['completed_at' => now()]);
            $user->increment('xp', $task->xp);
            $user->refresh();

            $unlocked = null;
            if ($task->achievement_id) {
                $remaining = $user->tasks()
                    ->where('achievement_id', $task->achievement_id)
                    ->whereNull('completed_at')
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
            ];
        });

        return response()->json([
            'task' => new TaskResource($task->fresh('achievement')),
            'user' => new UserResource($user->fresh()),
            ...$result,
        ]);
    }

    public function destroy(Request $request, int $taskId): JsonResponse
    {
        $request->user()->tasks()->findOrFail($taskId)->delete();

        return response()->json(['message' => 'Task deleted']);
    }
}
