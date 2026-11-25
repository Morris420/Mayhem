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
     * @return array{stats: array<string, int>, sources: array<string, array{skill: string, level: int}>, abilities: array<int, array>}
     */
    public static function fromLevels(array $levels): array
    {
        $level = fn (string $slug) => max(1, (int) ($levels[$slug] ?? 1));

        $stats = [];
        $sources = [];
        foreach (ArenaRules::STATS as $stat => [$skill]) {
            $stats[$stat] = ArenaRules::stat($stat, $level($skill));
            $sources[$stat] = ['skill' => $skill, 'level' => $level($skill)];
        }
        $stats['mana'] = ArenaRules::MANA;

        $abilities = [];
        foreach (ArenaRules::ABILITIES as $i => [$slug, $name, $skill, $needs, $built]) {
            $abilities[] = [
                'slug' => $slug,
                'name' => $name,
                'slot' => $i + 1,
                'key' => ArenaRules::KEYS[$i],
                'skill' => $skill,
                'requires' => $needs,
                'built' => $built,
                'unlocked' => $built && $level($skill) >= $needs,
            ];
        }

        return ['stats' => $stats, 'sources' => $sources, 'abilities' => $abilities];
    }
}
