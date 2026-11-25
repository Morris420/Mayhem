<?php

namespace Tests\Unit;

use App\Support\Arena\ArenaRules;
use App\Support\Arena\Loadout;
use PHPUnit\Framework\TestCase;

/**
 * The anchors of "skills matter only a little" (arena-design.md §0, decision 2). If a tuning change
 * breaks these, it changed how much the grind decides a fight: make that a deliberate decision.
 */
class ArenaRulesTest extends TestCase
{
    public function test_anchors_fresh_average_and_maxed(): void
    {
        // A fresh hunter (every skill 1): 80 health, 85% damage.
        $fresh = Loadout::fromLevels([])['stats'];
        $this->assertSame(['health' => 80, 'guard' => 80, 'damage' => 85, 'ability_power' => 85], $fresh);

        // Level 50 everywhere fights exactly like the frame data was tuned.
        $mid = Loadout::fromLevels(array_fill_keys(['strength', 'stamina', 'discipline', 'intellect'], 50))['stats'];
        $this->assertSame(['health' => 100, 'guard' => 100, 'damage' => 100, 'ability_power' => 100], $mid);

        // Maxed: 120 health, 115% damage.
        $max = Loadout::fromLevels(array_fill_keys(['strength', 'stamina', 'discipline', 'intellect'], 99))['stats'];
        $this->assertSame(['health' => 120, 'guard' => 120, 'damage' => 115, 'ability_power' => 115], $max);
    }

    public function test_the_gap_stays_small(): void
    {
        foreach (ArenaRules::STATS as $stat => [, , $span]) {
            $this->assertLessThanOrEqual(20, $span, "$stat may move at most ±20%");
            $this->assertLessThan(ArenaRules::stat($stat, 99), ArenaRules::stat($stat, 1));
        }
    }

    public function test_each_stat_follows_its_own_skill_and_levels_are_clamped(): void
    {
        $l = Loadout::fromLevels(['strength' => 99]);
        $this->assertSame(115, $l['stats']['damage']);
        $this->assertSame(80, $l['stats']['health']); // stamina still 1
        $this->assertSame(['skill' => 'strength', 'level' => 99], $l['sources']['damage']);
        $this->assertSame(ArenaRules::stat('damage', 99), ArenaRules::stat('damage', 500));
        $this->assertSame(ArenaRules::stat('damage', 1), ArenaRules::stat('damage', -3));
    }

    public function test_abilities_unlock_at_their_skill_threshold(): void
    {
        $abilities = collect(Loadout::fromLevels([])['abilities'])->keyBy('slug');
        $this->assertTrue($abilities['fire_bolt']['unlocked']); // every hunter's first spell
        $this->assertSame('Q', $abilities['fire_bolt']['key']);
        $this->assertFalse($abilities['shadow_slash']['unlocked']); // needs the Shadow Knight

        // Not built yet: shown, never unlocked, whatever the level.
        $high = collect(Loadout::fromLevels(['faith' => 99, 'discipline' => 99])['abilities'])->keyBy('slug');
        $this->assertFalse($high['iron_skin']['unlocked']);
        $this->assertFalse($high['iron_skin']['built']);
    }

    public function test_bosses_need_their_achievement_and_unlock_their_ability(): void
    {
        $none = Loadout::fromLevels([]);
        $this->assertSame('shadow_knight', $none['bosses'][0]['slug']);
        $this->assertFalse($none['bosses'][0]['available']);

        $runner = Loadout::fromLevels([], ['golden-medal']);
        $this->assertTrue($runner['bosses'][0]['available']);
        $this->assertFalse($runner['bosses'][0]['defeated']);

        $won = Loadout::fromLevels([], ['golden-medal'], ['shadow_knight']);
        $this->assertTrue($won['bosses'][0]['defeated']);
        $this->assertTrue(collect($won['abilities'])->firstWhere('slug', 'shadow_slash')['unlocked']);
    }
}
