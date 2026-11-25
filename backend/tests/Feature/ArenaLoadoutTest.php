<?php

namespace Tests\Feature;

use App\Models\Achievement;
use App\Models\Skill;
use App\Models\SkillXp;
use App\Models\User;
use App\Support\Arena\ArenaRules;
use App\Support\SkillCurve;
use Database\Seeders\AchievementSeeder;
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
        $this->seed(AchievementSeeder::class);
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
        $r->assertJsonMissingPath('stats.mana'); // no mana any more
        $r->assertJsonPath('bosses.0.available', false);
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

    private function marathoner(): User
    {
        $u = User::factory()->create();
        $u->achievements()->attach(Achievement::where('slug', 'golden-medal')->value('id'), ['unlocked_at' => now()]);

        return $u;
    }

    public function test_the_shadow_knight_needs_the_marathon(): void
    {
        $this->as(User::factory()->create())
            ->postJson('/api/arena/bosses/shadow_knight/defeat', ['duration_ms' => 60000])
            ->assertForbidden();
        $this->as($this->marathoner())->getJson('/api/arena/loadout')->assertJsonPath('bosses.0.available', true);
    }

    public function test_beating_the_shadow_knight_unlocks_shadow_slash_once(): void
    {
        $u = $this->marathoner();
        $r = $this->as($u)->postJson('/api/arena/bosses/shadow_knight/defeat', ['duration_ms' => 61000])->assertOk();
        $r->assertJsonPath('first', true)->assertJsonPath('unlocked', 'shadow_slash');
        $r->assertJsonPath('loadout.abilities.1.slug', 'shadow_slash');
        $r->assertJsonPath('loadout.abilities.1.unlocked', true);
        $r->assertJsonPath('loadout.bosses.0.defeated', true);

        $again = $this->as($u)->postJson('/api/arena/bosses/shadow_knight/defeat', ['duration_ms' => 40000])->assertOk();
        $again->assertJsonPath('first', false)->assertJsonPath('unlocked', null);
        $this->assertDatabaseHas('arena_boss_defeats', ['user_id' => $u->id, 'boss' => 'shadow_knight', 'wins' => 2, 'best_ms' => 40000]);
    }

    public function test_impossible_wins_and_unknown_bosses_are_refused(): void
    {
        $u = $this->marathoner();
        $this->as($u)->postJson('/api/arena/bosses/shadow_knight/defeat', ['duration_ms' => 2000])->assertStatus(422);
        $this->as($u)->postJson('/api/arena/bosses/nobody/defeat', ['duration_ms' => 60000])->assertNotFound();
        $this->assertDatabaseCount('arena_boss_defeats', 0);
    }

    public function test_the_grant_command_gives_an_achievement(): void
    {
        User::factory()->create(['username' => 'JohnDoe']);
        $this->artisan('mayhem:grant-achievement', ['username' => 'JohnDoe', 'slug' => 'golden-medal'])->assertSuccessful();
        $this->assertTrue(User::where('username', 'JohnDoe')->first()->achievements()->where('slug', 'golden-medal')->exists());
        $this->artisan('mayhem:grant-achievement', ['username' => 'Nobody', 'slug' => 'golden-medal'])->assertFailed();
    }
}
