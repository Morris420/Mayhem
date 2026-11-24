<?php

namespace App\Support;

/**
 * The level curve, shaped like Old School RuneScape's: every level costs about 10% more than the last,
 * so early levels come quickly and the top ones are a long road. RuneScape's numbers are huge
 * (level 99 = 13 million XP), so they are divided by SCALE to fit one person's daily life.
 * Change SCALE to make levelling faster (smaller) or slower (bigger).
 */
class SkillCurve
{
    public const MAX_LEVEL = 99;

    public const SCALE = 40;

    /** @var array<int, int>|null total XP needed to *reach* each level, index 1..99 */
    private static ?array $table = null;

    public static function xpForLevel(int $level): int
    {
        $table = self::table();

        return $table[max(1, min($level, self::MAX_LEVEL))];
    }

    public static function levelForXp(int $xp): int
    {
        $level = 1;
        $table = self::table();
        while ($level < self::MAX_LEVEL && $xp >= $table[$level + 1]) {
            $level++;
        }

        return $level;
    }

    /** @return array{level: int, xp: int, into: int, needed: int|null, pct: int, next_at: int|null} */
    public static function summary(int $xp): array
    {
        $level = self::levelForXp($xp);
        $floor = self::xpForLevel($level);
        $maxed = $level >= self::MAX_LEVEL;
        $ceiling = $maxed ? null : self::xpForLevel($level + 1);

        return [
            'level' => $level,
            'xp' => $xp,
            'into' => $xp - $floor,
            'needed' => $maxed ? null : $ceiling - $floor,
            'pct' => $maxed ? 100 : (int) floor(($xp - $floor) / ($ceiling - $floor) * 100),
            'next_at' => $ceiling,
        ];
    }

    private static function table(): array
    {
        if (self::$table === null) {
            $points = 0;
            self::$table = [1 => 0];
            for ($l = 1; $l < self::MAX_LEVEL; $l++) {
                $points += floor($l + 300 * (2 ** ($l / 7)));
                self::$table[$l + 1] = (int) floor(floor($points / 4) / self::SCALE);
            }
        }

        return self::$table;
    }
}
