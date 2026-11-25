<?php

namespace Tests\Unit;

use App\Support\Arena\ArenaRules;
use App\Support\Arena\Loadout;
use PHPUnit\Framework\TestCase;

class ArenaRulesTest extends TestCase
{
    public function test_a_fresh_hunter_has_base_stats_and_no_abilities(): void
    {
        $l = Loadout::fromLevels([]);
        $this->assertSame(['hp' => 1.0, 'damage' => 1.0, 'guard' => 1.0], $l['stats']);
        $this->assertSame(100, $l['maxHp']);
        $this->assertSame(100, $l['maxGuard']);
        $this->assertFalse(collect($l['abilities'])->contains('unlocked', true));
    }

    public function test_everything_at_99_gives_exactly_the_maximum_bonus(): void
    {
        $all = array_fill_keys(['strength', 'stamina', 'discipline', 'intellect', 'faith'], 99);
        $l = Loadout::fromLevels($all);
        foreach (ArenaRules::MAX_BONUS as $stat => $bonus) {
            $this->assertEqualsWithDelta(1 + $bonus, $l['stats'][$stat], 1e-9, $stat);
        }
        $this->assertSame(120, $l['maxHp']);
        $this->assertTrue(collect($l['abilities'])->every('unlocked', true));
    }

    public function test_skills_matter_only_a_little(): void
    {
        // Decided: technique decides a fight. No stat may more than ~1.2x its base.
        foreach (ArenaRules::MAX_BONUS as $stat => $bonus) {
            $this->assertLessThanOrEqual(0.2, $bonus, $stat);
        }
    }

    public function test_the_current_save_gets_a_modest_edge(): void
    {
        // The anchor from the design doc: Strength 50, Stamina 9, Discipline 33.
        $l = Loadout::fromLevels(['strength' => 50, 'stamina' => 9, 'discipline' => 33]);
        $this->assertGreaterThan(1.05, $l['stats']['damage']);
        $this->assertLessThan(1.1, $l['stats']['damage']);
        $this->assertGreaterThan(100, $l['maxHp']);
        $this->assertLessThan(110, $l['maxHp']);
        $this->assertTrue(collect($l['abilities'])->firstWhere('slug', 'heavy_blow')['unlocked']);
        $this->assertTrue(collect($l['abilities'])->firstWhere('slug', 'iron_skin')['unlocked']);
        $this->assertFalse(collect($l['abilities'])->firstWhere('slug', 'fire_bolt')['unlocked']);
    }

    public function test_weights_of_each_stat_add_up_to_one(): void
    {
        foreach (ArenaRules::SOURCES as $stat => $sources) {
            $this->assertEqualsWithDelta(1.0, array_sum($sources), 1e-9, $stat);
        }
    }

    public function test_levels_above_99_are_capped(): void
    {
        $this->assertEquals(Loadout::fromLevels(['strength' => 99])['stats'], Loadout::fromLevels(['strength' => 500])['stats']);
    }
}
