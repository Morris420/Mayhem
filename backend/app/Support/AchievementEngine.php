<?php

namespace App\Support;

use App\Models\Achievement;
use App\Models\ExerciseLog;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Unlocks the achievements that have a rule, based on your gym and diet history.
 * Call evaluate() after anything that could move a number (logging a lift, adding food).
 */
class AchievementEngine
{
    /** How each rule is described next to its progress bar ("6 of 10 workouts"). */
    public const UNITS = [
        'gym_sessions' => 'workouts',
        'gym_records' => 'records',
        'gym_week_days' => 'days in one week',
        'diet_days_ok' => 'days on target',
        'diet_streak' => 'days in a row',
    ];

    /** @return array<string, int> current value of every rule */
    public function metrics(User $user): array
    {
        $logs = ExerciseLog::where('user_id', $user->id)->orderBy('date')->orderBy('id')->get(['exercise_id', 'date', 'weight']);
        $dates = $logs->pluck('date')->map(fn ($d) => $d->toDateString())->unique()->values();

        // personal records: every time a lift beat its own previous best (the first log doesn't count)
        $records = 0;
        foreach ($logs->groupBy('exercise_id') as $exerciseLogs) {
            $best = null;
            foreach ($exerciseLogs as $l) {
                if ($best !== null && $l->weight > $best) {
                    $records++;
                }
                $best = max($best ?? $l->weight, $l->weight);
            }
        }

        $bestWeek = $dates->groupBy(fn ($d) => Carbon::parse($d)->format('o-W'))->map->count()->max() ?? 0;

        $diet = DietRules::perDay($user);

        return [
            'gym_sessions' => $dates->count(),
            'gym_records' => $records,
            'gym_week_days' => (int) $bestWeek,
            'diet_days_ok' => $diet->where('ok', true)->count(),
            'diet_streak' => $this->longestRun($diet->filter(fn ($d) => $d['ok'])->keys()),
        ];
    }

    /**
     * Unlock everything newly reached.
     *
     * @return array<int, array{id: int, name: string, description: string, icon: string}>
     */
    public function evaluate(User $user): array
    {
        $unlockedIds = $user->achievements()->pluck('achievements.id');
        $pending = Achievement::whereNull('user_id')->whereNotNull('rule')->whereNotIn('id', $unlockedIds)->get();
        if ($pending->isEmpty()) {
            return [];
        }

        $metrics = $this->metrics($user);
        $newly = [];
        foreach ($pending as $a) {
            if (($metrics[$a->rule] ?? 0) >= $a->threshold) {
                $user->achievements()->attach($a->id, ['unlocked_at' => now()]);
                $newly[] = ['id' => $a->id, 'name' => $a->name, 'description' => $a->description, 'icon' => $a->icon];
            }
        }

        return $newly;
    }

    /** Longest run of consecutive calendar days in a sorted list of Y-m-d strings. */
    private function longestRun($dates): int
    {
        $best = $run = 0;
        $prev = null;
        foreach ($dates as $d) {
            $day = Carbon::parse($d)->startOfDay();
            $run = ($prev && $prev->copy()->addDay()->equalTo($day)) ? $run + 1 : 1;
            $best = max($best, $run);
            $prev = $day;
        }

        return $best;
    }
}
