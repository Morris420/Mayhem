<?php

namespace App\Support\Arena;

/**
 * Skills -> a fighter: the stat block and abilities the arena hands the simulation. Pure: it takes skill
 * levels and returns plain data, so it is unit-testable without a database. The client never computes
 * any of this; it receives it from GET /api/arena/loadout and feeds it into the sim as an input.
 */
class Loadout
{
    /**
     * @param  array<string, int>  $levels  skill slug => level (missing skills count as level 1)
     * @param  array<int, string>  $achievements  slugs of the achievements the hunter has unlocked
     * @param  array<int, string>  $defeated  slugs of the bosses the hunter has beaten
     * @return array{stats: array<string, int>, sources: array<string, array{skill: string, level: int}>, abilities: array<int, array>, bosses: array<int, array>}
     */
    public static function fromLevels(array $levels, array $achievements = [], array $defeated = []): array
    {
        $level = fn (string $slug) => max(1, (int) ($levels[$slug] ?? 1));

        $stats = [];
        $sources = [];
        foreach (ArenaRules::STATS as $stat => [$skill]) {
            $stats[$stat] = ArenaRules::stat($stat, $level($skill));
            $sources[$stat] = ['skill' => $skill, 'level' => $level($skill)];
        }

        $abilities = [];
        foreach (ArenaRules::ABILITIES as $i => [$slug, $name, $skill, $needs, $built, $boss]) {
            $bossBeaten = $boss === null || in_array($boss, $defeated, true);
            $abilities[] = [
                'slug' => $slug,
                'name' => $name,
                'slot' => $i + 1,
                'key' => ArenaRules::KEYS[$i],
                'skill' => $skill,
                'requires' => $needs,
                'built' => $built,
                'boss' => $boss,
                'unlocked' => $built && $level($skill) >= $needs && $bossBeaten,
            ];
        }

        $bosses = [];
        foreach (ArenaRules::BOSSES as $slug => [$name, $achievement, $unlocks]) {
            $bosses[] = [
                'slug' => $slug,
                'name' => $name,
                'requires' => $achievement,
                'available' => in_array($achievement, $achievements, true),
                'defeated' => in_array($slug, $defeated, true),
                'unlocks' => $unlocks,
            ];
        }

        return ['stats' => $stats, 'sources' => $sources, 'abilities' => $abilities, 'bosses' => $bosses];
    }
}
