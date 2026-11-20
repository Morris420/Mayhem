<?php

namespace App\Support;

use App\Models\Task;
use App\Models\TaskCompletion;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Answers "what is planned on day X, and what is already done?" for the
 * dashboard's Today list and the Calendar page, so both always agree.
 */
class QuestPlanner
{
    /** @return array<int, array<string, mixed>> one entry per day */
    public function range(User $user, CarbonInterface $start, int $days): array
    {
        $tasks = $user->tasks()->with('achievement:id,name,icon')->get();
        $completions = TaskCompletion::where('user_id', $user->id)->get()->groupBy('task_id');
        $today = now()->startOfDay();

        return collect(range(0, $days - 1))
            ->map(fn ($i) => $this->day($tasks, $completions, $start->copy()->addDays($i)->startOfDay(), $today))
            ->all();
    }

    private function day(Collection $tasks, Collection $completions, CarbonInterface $date, CarbonInterface $today): array
    {
        $isToday = $date->isSameDay($today);
        $items = collect();

        foreach ($tasks as $task) {
            /** @var Collection<int, TaskCompletion> $done */
            $done = $completions->get($task->id, collect());
            $overdue = false;

            if ($task->isRecurring()) {
                if (! $task->occursOn($date)) {
                    continue;
                }
                $kind = 'recurring';
                $isDone = $done->contains(fn ($c) => $c->date->isSameDay($date));
                $xp = $done->first(fn ($c) => $c->date->isSameDay($date))?->xp ?? $task->xp;
            } elseif ($task->scheduled_date) {
                $kind = 'dated';
                $isDone = $done->isNotEmpty();
                if ($task->scheduled_date->isSameDay($date)) {
                    // planned for exactly this day
                } elseif ($isToday && $task->scheduled_date->lt($today) && ! $isDone) {
                    $overdue = true; // missed earlier: nag me today
                } else {
                    continue;
                }
                $xp = $done->first()?->xp ?? $task->xp;
            } else {
                $kind = 'floating';
                $finished = $done->sortBy('date')->first();
                if ($finished) {
                    if (! $finished->date->isSameDay($date)) {
                        continue;     // shown on the day it was done
                    }
                    $isDone = true;
                    $xp = $finished->xp;
                } else {
                    if (! $isToday) {
                        continue;     // still to-do: lives on today's list
                    }
                    $isDone = false;
                    $xp = $task->xp;
                }
            }

            $items->push([
                'task_id' => $task->id,
                'title' => $task->title,
                'description' => $task->description,
                'tier' => $task->tier,
                'xp' => $xp,
                'kind' => $kind,
                'done' => $isDone,
                'overdue' => $overdue,
                'can_complete' => $isToday && ! $isDone,
                'achievement' => $task->achievement
                    ? ['id' => $task->achievement->id, 'name' => $task->achievement->name, 'icon' => $task->achievement->icon]
                    : null,
            ]);
        }

        $items = $items->sortBy([['done', 'asc'], ['xp', 'desc'], ['title', 'asc']])->values();

        return [
            'date' => $date->toDateString(),
            'is_today' => $isToday,
            'items' => $items->all(),
            'total' => $items->count(),
            'done' => $items->where('done', true)->count(),
            'xp_planned' => (int) $items->sum('xp'),
            'xp_done' => (int) $items->where('done', true)->sum('xp'),
        ];
    }
}
