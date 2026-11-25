<?php

namespace Tests\Feature;

use App\Models\Skill;
use App\Models\SkillXp;
use App\Models\User;
use App\Support\Arena\ArenaRules;
use App\Support\SkillCurve;
use Database\Seeders\SkillSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ArenaLoadoutTest extends TestCase
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

    private function train(User $user, string $slug, int $level): void
    {
        SkillXp::create([
            'user_id' => $user->id,
            'skill_id' => Skill::where('slug', $slug)->value('id'),
            'amount' => SkillCurve::xpForLevel($level),
            'source' => 'test',
            'ref' => "test:$slug",
            'date' => '2026-11-25',
        ]);
    }

    public function test_requires_login(): void
    {
        $this->getJson('/api/arena/loadout')->assertUnauthorized();
    }

    public function test_a_fresh_hunter_gets_the_base_loadout(): void
    {
        $r = $this->as(User::factory()->create())->getJson('/api/arena/loadout')->assertOk();

        $r->assertJsonPath('stats.health', ArenaRules::stat('health', 1));
        $r->assertJsonPath('stats.damage', ArenaRules::stat('damage', 1));
        $r->assertJsonPath('stats.mana', ArenaRules::MANA);
        $r->assertJsonPath('abilities.0.slug', 'fire_bolt');
        $r->assertJsonPath('abilities.0.unlocked', true);
        $r->assertJsonCount(3, 'abilities');
    }

    public function test_stats_come_from_the_users_own_skills(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->train($me, 'strength', 99);
        $this->train($me, 'stamina', 50);
        $this->train($other, 'stamina', 99);

        $r = $this->as($me)->getJson('/api/arena/loadout')->assertOk();
        $r->assertJsonPath('stats.damage', 115);
        $r->assertJsonPath('stats.health', 100);
        $r->assertJsonPath('sources.damage', ['skill' => 'strength', 'level' => 99]);

        // Someone else's training never leaks into your fighter.
        $this->as($other)->getJson('/api/arena/loadout')->assertJsonPath('stats.damage', 85);
    }
}
