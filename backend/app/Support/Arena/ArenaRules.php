<?php

namespace App\Support\Arena;

/**
 * Every balance number of the arena that the server owns, in one place (like Progression and
 * SkillCurve). The client's feel numbers (frame data, speeds) live in frontend/src/arena/moves.js;
 * what your skills are worth in a fight lives here.
 *
 * Decided 25 Nov (arena-design.md §0, decision 2): skills matter only a little. Each stat moves
 * linearly with one skill's level, from (100 - span)% at level 1 to (100 + span)% at level 99, so a
 * level-50 hunter fights exactly like the frame data was tuned, and a maxed hunter against a fresh one
 * is a visible edge, never a foregone conclusion.
 */
class ArenaRules
{
    public const MAX_LEVEL = 99;

    /**
     * stat => [skill slug, base value, span in % either side of the base].
     * `damage` and `ability_power` are percentages the simulation multiplies its frame data by;
     * `health` and `guard` are the fighter's pools.
     */
    public const STATS = [
        'health' => ['stamina', 100, 20],
        'guard' => ['discipline', 100, 20],
        'damage' => ['strength', 100, 15],
        'ability_power' => ['intellect', 100, 15],
    ];

    /** Mana is the same for everyone for now: abilities differ by what you unlocked, not by pool size. */
    public const MANA = 100;

    /**
     * The abilities, in slot order (Q, E, R): [slug, name, skill, level needed, built yet].
     * `built` = false means it is shown in the HUD as coming but cannot be cast yet.
     * Fire bolt is every hunter's first spell (Intellect 1), so there is always something to try.
     */
    public const ABILITIES = [
        ['fire_bolt', 'Fire bolt', 'intellect', 1, true],
        ['second_wind', 'Second wind', 'faith', 10, false],
        ['iron_skin', 'Iron skin', 'discipline', 20, false],
    ];

    public const KEYS = ['Q', 'E', 'R'];

    /** A stat's value for a skill level, rounded to a whole number. */
    public static function stat(string $stat, int $level): int
    {
        [, $base, $span] = self::STATS[$stat];
        $t = (max(1, min($level, self::MAX_LEVEL)) - 1) / (self::MAX_LEVEL - 1); // 0 .. 1

        return (int) round($base * (1 + $span / 100 * (2 * $t - 1)));
    }
}
