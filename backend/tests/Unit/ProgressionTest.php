<?php

namespace Tests\Unit;

use App\Support\Progression;
use PHPUnit\Framework\TestCase;

class ProgressionTest extends TestCase
{
    public function test_level_thresholds(): void
    {
        $this->assertSame(1, Progression::levelForXp(0));
        $this->assertSame(1, Progression::levelForXp(99));
        $this->assertSame(2, Progression::levelForXp(100));
        $this->assertSame(3, Progression::levelForXp(300));
        $this->assertSame(5, Progression::levelForXp(1000));
    }

    public function test_summary_and_rank(): void
    {
        $s = Progression::summary(150);
        $this->assertSame(2, $s['level']);
        $this->assertSame(50, $s['xp_into_level']);
        $this->assertSame(200, $s['xp_for_next']);
        $this->assertSame(25, $s['progress_pct']);
        $this->assertSame('E', $s['rank']);
        $this->assertSame('D', Progression::rankForLevel(5)['rank']);
        $this->assertSame('S', Progression::rankForLevel(50)['rank']);
    }
}
