<?php

namespace App\Support\Arena;

use App\Models\User;
use App\Support\SkillService;

/**
 * A hunter's fighter, computed from the skills they trained. The client receives
 * multipliers and unlocks and never sends them back: the server owns these numbers.
 */
class Loadout
{
    public function __construct(private SkillService $skills) {}

    /** @return array{stats: array, maxHp: int, maxGuard: int, abilities: array, levels: array} */
    public function for(User $user): array
    {
        $this->skills->refresh($user);
        $levels = collect($this->skills->overview($user))->pluck('level', 'slug')->map(fn ($l) => (int) $l)->all();

        return self::fromLevels($levels);
    }

    /**
     * The pure calculation, separate so it can be unit-tested with any levels.
     *
     * @param  array<string, int>  $levels  skill slug => level
     */
    public static function fromLevels(array $levels): array
    {
        $stats = [];
        foreach (ArenaRules::SOURCES as $stat => $sources) {
            $p = 0.0;
            foreach ($sources as $skill => $weight) {
                $p += $weight * ArenaRules::progress($levels[$skill] ?? 1);
            }
            $stats[$stat] = round(1 + ArenaRules::MAX_BONUS[$stat] * $p, 3);
        }

        $abilities = array_map(fn ($a) => [
            'slug' => $a['slug'],
            'name' => $a['name'],
            'skill' => $a['skill'],
            'level' => $a['level'],
            'live' => $a['live'],
            'unlocked' => ($levels[$a['skill']] ?? 1) >= $a['level'],
        ], ArenaRules::ABILITIES);

        return [
            'stats' => $stats,
            'maxHp' => (int) round(ArenaRules::BASE_HP * $stats['hp']),
            'maxGuard' => (int) round(ArenaRules::BASE_GUARD * $stats['guard']),
            'abilities' => $abilities,
            'levels' => $levels,
        ];
    }
}
