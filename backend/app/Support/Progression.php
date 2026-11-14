<?php

namespace App\Support;

/**
 * All the "game rules" in one place: tier -> XP, XP -> level, level -> rank.
 * Keeping this out of controllers means we can tweak balance without hunting
 * through the codebase (and unit-test it easily).
 */
class Progression
{
    /** XP awarded for completing a task of each tier. */
    public const TIER_XP = [
        'E' => 10,
        'D' => 25,
        'C' => 50,
        'B' => 100,
        'A' => 200,
        'S' => 400,
    ];

    /** Total XP needed to *reach* a level: 0, 100, 300, 600, 1000, ... */
    public static function xpForLevel(int $level): int
    {
        return (int) (100 * ($level - 1) * $level / 2);
    }

    public static function levelForXp(int $xp): int
    {
        $level = 1;
        while ($xp >= self::xpForLevel($level + 1)) {
            $level++;
        }

        return $level;
    }

    /** @return array{rank: string, title: string} */
    public static function rankForLevel(int $level): array
    {
        return match (true) {
            $level >= 50 => ['rank' => 'S', 'title' => 'Shadow Monarch'],
            $level >= 35 => ['rank' => 'A', 'title' => 'Master Hunter'],
            $level >= 20 => ['rank' => 'B', 'title' => 'Elite Hunter'],
            $level >= 10 => ['rank' => 'C', 'title' => 'Gate Runner'],
            $level >= 5 => ['rank' => 'D', 'title' => 'Rising Hunter'],
            default => ['rank' => 'E', 'title' => 'Unawakened Novice'],
        };
    }

    /** Everything the hero section needs about a player's progress. */
    public static function summary(int $xp): array
    {
        $level = self::levelForXp($xp);
        $floor = self::xpForLevel($level);
        $ceiling = self::xpForLevel($level + 1);
        $into = $xp - $floor;
        $needed = $ceiling - $floor;

        return [
            'level' => $level,
            'xp' => $xp,
            'xp_into_level' => $into,
            'xp_for_next' => $needed,
            'progress_pct' => (int) floor($into / $needed * 100),
            ...self::rankForLevel($level),
        ];
    }
}
