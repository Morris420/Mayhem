<?php

namespace Tests\Feature;

use App\Models\Skill;
use App\Models\User;
use App\Support\SkillCurve;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SkillsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-23 12:00:00'));
        $this->seed(\Database\Seeders\SkillSeeder::class);
        $this->user = User::factory()->create(['kcal_goal' => 3200, 'protein_goal' => 190]);
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function skill(string $slug): array
    {
        return collect($this->getJson('/api/skills')->json('skills'))->firstWhere('slug', $slug);
    }

    public function test_curve_is_monotonic_and_capped(): void
    {
        $this->assertSame(1, SkillCurve::levelForXp(0));
        $this->assertSame(2, SkillCurve::levelForXp(SkillCurve::xpForLevel(2)));
        $this->assertSame(1, SkillCurve::levelForXp(SkillCurve::xpForLevel(2) - 1));
        $this->assertSame(99, SkillCurve::levelForXp(10_000_000));
        $this->assertGreaterThan(SkillCurve::xpForLevel(50), SkillCurve::xpForLevel(51));
    }

    public function test_nine_skills_start_at_level_one(): void
    {
        $skills = $this->getJson('/api/skills')->assertOk()->json('skills');
        $this->assertCount(9, $skills);
        $this->assertSame(9, $this->getJson('/api/skills')->json('total_level'));
    }

    public function test_completing_a_quest_trains_its_skill_once(): void
    {
        $literacy = Skill::where('slug', 'literacy')->value('id');
        $id = $this->postJson('/api/tasks', ['title' => 'Read 20 pages', 'tier' => 'B', 'skill_id' => $literacy])->assertCreated()->json('data.id');

        $r = $this->postJson("/api/tasks/$id/complete")->assertOk();
        $this->assertSame(100, $this->skill('literacy')['xp']);
        $this->assertNotEmpty($r->json('skill_level_ups'));

        $this->postJson("/api/tasks/$id/complete")->assertOk();
        $this->assertSame(100, $this->skill('literacy')['xp']); // never counted twice
    }

    public function test_quests_default_to_discipline(): void
    {
        $r = $this->postJson('/api/tasks', ['title' => 'Make bed', 'tier' => 'E'])->assertCreated();
        $this->assertSame('discipline', $r->json('data.skill.slug'));
    }

    public function test_gym_trains_strength_and_deleting_a_log_takes_it_back(): void
    {
        $ex = $this->postJson('/api/gym/exercises', ['name' => 'Bench', 'body_part' => 'chest', 'weekdays' => [1]])->json('id');
        $this->postJson("/api/gym/exercises/$ex/logs", ['weight' => 60, 'date' => '2026-11-20'])->assertOk();
        $this->assertSame(30, $this->skill('strength')['xp']);

        $this->postJson("/api/gym/exercises/$ex/logs", ['weight' => 65, 'date' => '2026-11-21'])->assertOk();
        $log = \App\Models\ExerciseLog::where('date', '2026-11-21')->value('id');
        $this->assertSame(30 + 30 + 15, $this->skill('strength')['xp']); // 2 days + 1 record

        $this->assertNotNull($log);
        $this->deleteJson("/api/gym/logs/$log")->assertOk();
        $this->assertSame(30, $this->skill('strength')['xp']);
    }

    public function test_dashboard_carries_skills_and_total_level(): void
    {
        $r = $this->getJson('/api/dashboard')->assertOk();
        $this->assertCount(9, $r->json('skills'));
        $this->assertSame(9, $r->json('total_level'));
    }
}
