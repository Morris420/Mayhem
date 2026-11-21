<?php

namespace App\Support;

use App\Models\ExerciseLog;
use App\Models\User;
use Carbon\CarbonInterface;

/**
 * "What is my workout on day X?" - shared by the gym page and the calendar.
 * The body parts of a day are simply the body parts of the exercises scheduled on it.
 */
class GymPlanner
{
    /** @return array<string, array<string, mixed>> keyed by Y-m-d */
    public function days(User $user, CarbonInterface $start, int $days): array
    {
        $exercises = $user->exercises()->get();
        $end = $start->copy()->addDays($days - 1);
        $logged = ExerciseLog::where('user_id', $user->id)
            ->whereDate('date', '>=', $start->toDateString())
            ->whereDate('date', '<=', $end->toDateString())
            ->get()->groupBy(fn ($l) => $l->date->toDateString());

        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $start->copy()->addDays($i)->startOfDay();
            $planned = $exercises->filter(fn ($e) => $e->occursOnWeekday($date->isoWeekday()));
            $logs = $logged->get($date->toDateString(), collect());

            $out[$date->toDateString()] = [
                'date' => $date->toDateString(),
                'weekday' => $date->isoWeekday(),
                'is_today' => $date->isSameDay(now()),
                'body_parts' => $planned->pluck('body_part')->unique()->values()->all(),
                'exercise_ids' => $planned->pluck('id')->values()->all(),
                'exercises' => $planned->count(),
                'logged' => $logs->count(),
                'trained' => $logs->isNotEmpty(),
            ];
        }

        return $out;
    }

    /**
     * Physique stage from how many workouts (distinct training days) you have logged.
     * Five stages; the figure on the dashboard gets visibly bigger with each one.
     */
    public const STAGES = [
        ['stage' => 1, 'name' => 'Beginner', 'sessions' => 0],
        ['stage' => 2, 'name' => 'Lean', 'sessions' => 6],
        ['stage' => 3, 'name' => 'Athletic', 'sessions' => 20],
        ['stage' => 4, 'name' => 'Strong', 'sessions' => 45],
        ['stage' => 5, 'name' => 'Titan', 'sessions' => 90],
    ];

    public static function physique(int $sessions): array
    {
        $current = self::STAGES[0];
        foreach (self::STAGES as $s) {
            if ($sessions >= $s['sessions']) {
                $current = $s;
            }
        }
        $next = self::STAGES[$current['stage']] ?? null; // stage numbers are 1-based, so index == next stage

        return [
            'stage' => $current['stage'],
            'name' => $current['name'],
            'sessions' => $sessions,
            'next' => $next ? [
                'name' => $next['name'],
                'sessions_needed' => $next['sessions'],
                'remaining' => $next['sessions'] - $sessions,
                'pct' => (int) floor(($sessions - $current['sessions']) / ($next['sessions'] - $current['sessions']) * 100),
            ] : null,
            'stages' => self::STAGES,
        ];
    }
}
