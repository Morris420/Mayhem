<?php

namespace App\Support;

use App\Models\MealEntry;
use App\Models\User;
use Illuminate\Support\Collection;

/** What "hit my diet goals" means. One place, so the diet page, calendar and achievements agree. */
class DietRules
{
    /** Calories count as "on target" within this margin of your goal. Protein just has to reach its goal. */
    public const KCAL_MARGIN = 0.10;

    public static function status(float $kcal, float $protein, int $kcalGoal, int $proteinGoal): array
    {
        $state = $kcal < $kcalGoal * (1 - self::KCAL_MARGIN) ? 'under' : ($kcal > $kcalGoal * (1 + self::KCAL_MARGIN) ? 'over' : 'on');
        $proteinReached = $protein >= $proteinGoal;

        return [
            'kcal' => ['state' => $state, 'pct' => (int) round($kcal / max(1, $kcalGoal) * 100), 'remaining' => (int) round($kcalGoal - $kcal)],
            'protein' => ['reached' => $proteinReached, 'pct' => (int) round($protein / max(1, $proteinGoal) * 100), 'remaining' => (int) max(0, round($proteinGoal - $protein))],
            'day_ok' => $state === 'on' && $proteinReached,
        ];
    }

    /**
     * Totals for every day you logged food: date => [kcal, protein, ok].
     * Judged against your *current* goals.
     *
     * @return Collection<string, array{kcal: float, protein: float, ok: bool}>
     */
    public static function perDay(User $user): Collection
    {
        $kcalGoal = (int) $user->kcal_goal;
        $proteinGoal = (int) $user->protein_goal;

        return MealEntry::where('user_id', $user->id)->get(['date', 'kcal', 'protein'])
            ->groupBy(fn ($e) => $e->date->toDateString())
            ->map(function (Collection $c) use ($kcalGoal, $proteinGoal) {
                $kcal = (float) $c->sum('kcal');
                $protein = (float) $c->sum('protein');

                return ['kcal' => $kcal, 'protein' => $protein, 'ok' => self::status($kcal, $protein, $kcalGoal, $proteinGoal)['day_ok']];
            })
            ->sortKeys();
    }
}
