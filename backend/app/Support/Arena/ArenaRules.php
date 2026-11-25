<?php

namespace App\Support\Arena;

/**
 * Every arena number the server decides, in one place (like Progression and SkillCurve).
 *
 * Decided with Morrison (arena-design.md §0): skill levels matter only a little. A
 * fresh hunter and a level-99 one fight on nearly the same terms, so technique
 * decides a fight, but the grind is still visible. Tune here; nothing else changes.
 */
class ArenaRules
{
    /** How much a stat can grow, from all skills at level 1 to all at 99 (0.20 = +20%). */
    public const MAX_BONUS = [
        'hp' => 0.20,
        'damage' => 0.15,
        'guard' => 0.20,
    ];

    /** Which skills feed each stat, and how much each one counts (weights sum to 1). */
    public const SOURCES = [
        'hp' => ['stamina' => 0.6, 'discipline' => 0.4],
        'damage' => ['strength' => 0.7, 'intellect' => 0.3],
        'guard' => ['discipline' => 0.6, 'faith' => 0.4],
    ];

    /** The base values the multipliers apply to (they match the game's COMBAT constants). */
    public const BASE_HP = 100;

    public const BASE_GUARD = 100;

    /**
     * Abilities unlock at skill levels: something to chase. Only those marked live exist in
     * the game yet; the rest show as "coming" so the goal is visible.
     */
    public const ABILITIES = [
        ['slug' => 'fire_bolt', 'name' => 'Fire bolt', 'skill' => 'intellect', 'level' => 10, 'live' => false],
        ['slug' => 'second_wind', 'name' => 'Second wind', 'skill' => 'faith', 'level' => 10, 'live' => false],
        ['slug' => 'iron_skin', 'name' => 'Iron skin', 'skill' => 'discipline', 'level' => 20, 'live' => false],
        ['slug' => 'heavy_blow', 'name' => 'Heavy blow', 'skill' => 'strength', 'level' => 10, 'live' => true],
    ];

    /** 0 at level 1, 1 at level 99. */
    public static function progress(int $level): float
    {
        return (max(1, min(99, $level)) - 1) / 98;
    }
}
