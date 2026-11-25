<?php

namespace Tests\Feature;

use App\Models\Skill;
use App\Models\SkillXp;
use App\Models\User;
use App\Support\SkillCurve;
use Database\Seeders\SkillSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ArenaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SkillSeeder::class);
    }

    private function as(User $user): static
    {
        return $this->actingAs($user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    public function test_the_loadout_needs_a_login(): void
    {
        $this->getJson('/api/arena/loadout')->assertUnauthorized();
    }

    public function test_a_new_hunter_gets_base_stats(): void
    {
        $this->as(User::factory()->create())->getJson('/api/arena/loadout')
            ->assertOk()
            ->assertJsonPath('maxHp', 100)
            ->assertJsonPath('stats.damage', 1)
            ->assertJsonCount(4, 'abilities');
    }

    public function test_trained_skills_raise_the_stats_a_little(): void
    {
        $user = User::factory()->create();
        $strength = Skill::where('slug', 'strength')->first();
        SkillXp::create(['user_id' => $user->id, 'skill_id' => $strength->id, 'amount' => SkillCurve::xpForLevel(50), 'source' => 'quest', 'ref' => 'test:1', 'date' => now()->toDateString()]);

        $json = $this->as($user)->getJson('/api/arena/loadout')->assertOk()->json();
        $this->assertSame(50, $json['levels']['strength']);
        $this->assertGreaterThan(1.05, $json['stats']['damage']);
        $this->assertLessThan(1.15, $json['stats']['damage']);
        $this->assertTrue(collect($json['abilities'])->firstWhere('slug', 'heavy_blow')['unlocked']);
    }

    public function test_one_hunters_skills_never_leak_into_anothers_loadout(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $strength = Skill::where('slug', 'strength')->first();
        SkillXp::create(['user_id' => $a->id, 'skill_id' => $strength->id, 'amount' => SkillCurve::xpForLevel(99), 'source' => 'quest', 'ref' => 'test:2', 'date' => now()->toDateString()]);

        $this->as($b)->getJson('/api/arena/loadout')->assertJsonPath('stats.damage', 1);
    }
}
