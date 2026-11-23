<?php

namespace Tests\Feature;

use App\Models\Achievement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AutoAchievementTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-23 12:00:00')); // a Monday
        $this->user = User::factory()->create(['kcal_goal' => 3200, 'protein_goal' => 190]);
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function exercise(string $name = 'Bench press'): int
    {
        return $this->postJson('/api/gym/exercises', ['name' => $name, 'body_part' => 'chest', 'weekdays' => [1]])->json('id');
    }

    private function lift(int $id, float $w, string $date)
    {
        return $this->postJson("/api/gym/exercises/$id/logs", ['weight' => $w, 'date' => $date]);
    }

    private function eat(int $kcal, int $protein, string $date)
    {
        // 100 g of a food whose per-100g values are the totals we want
        return $this->postJson('/api/nutrition/entries', [
            'date' => $date, 'grams' => 100,
            'food' => ['name' => 'Test meal', 'kcal_100g' => min($kcal, 900), 'protein_100g' => min($protein, 100)],
        ]);
    }

    private function goodDay(string $date): void
    {
        // 4 x 100 g of 800 kcal / 48 protein = 3200 kcal, 192 protein
        for ($i = 0; $i < 4; $i++) {
            $this->eat(800, 48, $date)->assertCreated();
        }
    }

    public function test_catalog_has_rule_based_gym_and_diet_achievements(): void
    {
        $this->assertGreaterThanOrEqual(10, Achievement::whereNotNull('rule')->count());
        $this->assertSame(1, Achievement::where('slug', 'first-rep')->value('threshold'));
    }

    public function test_first_workout_unlocks_first_rep_and_returns_it(): void
    {
        $id = $this->exercise();
        $res = $this->lift($id, 60, '2026-11-23')->assertOk();
        $this->assertSame(['First Rep'], collect($res->json('unlocked'))->pluck('name')->all());

        // logging again doesn't re-announce it
        $this->assertSame([], $this->lift($id, 62.5, '2026-11-23')->json('unlocked'));
    }

    public function test_beating_a_best_unlocks_iron_body(): void
    {
        $id = $this->exercise();
        $this->lift($id, 60, '2026-11-16');
        $res = $this->lift($id, 65, '2026-11-23');
        $this->assertContains('Iron Body', collect($res->json('unlocked'))->pluck('name')->all());
    }

    public function test_five_training_days_in_one_week(): void
    {
        $id = $this->exercise();
        foreach (['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'] as $d) {
            $this->lift($id, 50, $d);
        }
        $this->assertNotContains('Five-a-Week', collect($this->getJson('/api/dashboard')->json('achievements'))->where('unlocked', true)->pluck('name')->all());
        $res = $this->lift($id, 50, '2026-11-20');
        $this->assertContains('Five-a-Week', collect($res->json('unlocked'))->pluck('name')->all());
    }

    public function test_diet_day_hit_unlocks_on_target(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->eat(800, 48, '2026-11-23');
        }
        $res = $this->eat(800, 48, '2026-11-23')->assertCreated();
        $this->assertTrue($res->json('status.day_ok'));
        $this->assertContains('On Target', collect($res->json('unlocked'))->pluck('name')->all());
    }

    public function test_seven_day_streak_unlocks_iron_chef(): void
    {
        foreach (range(10, 16) as $d) {
            $this->goodDay("2026-11-$d");
        }
        $names = collect($this->getJson('/api/dashboard')->json('achievements'))->where('unlocked', true)->pluck('name')->all();
        $this->assertContains('Iron Chef', $names);
    }

    public function test_a_broken_streak_does_not_unlock(): void
    {
        foreach ([10, 11, 12, 14, 15, 16] as $d) {
            $this->goodDay("2026-11-$d");
        }
        $a = collect($this->getJson('/api/dashboard')->json('achievements'))->firstWhere('name', 'Iron Chef');
        $this->assertFalse($a['unlocked']);
        $this->assertSame(3, $a['progress']['done']);
        $this->assertSame(7, $a['progress']['total']);
        $this->assertTrue($a['auto']);
    }

    public function test_dashboard_catches_up_on_history(): void
    {
        $this->goodDay('2026-11-20');
        $names = collect($this->getJson('/api/dashboard')->json('achievements'))->where('unlocked', true)->pluck('name')->all();
        $this->assertContains('On Target', $names);
    }

    public function test_auto_achievements_cannot_be_linked_to_quests(): void
    {
        $id = Achievement::where('slug', 'first-rep')->value('id');
        $this->postJson('/api/tasks', ['title' => 'x', 'tier' => 'E', 'achievement_id' => $id])->assertStatus(422);
    }

    public function test_checklist_defaults_toggle_add_remove(): void
    {
        $res = $this->getJson('/api/nutrition')->assertOk();
        $this->assertSame(['Vitamins', 'Fruit', 'Vegetables'], collect($res->json('checklist'))->pluck('name')->all());
        $this->assertSame(0, $res->json('extras.done'));

        $vit = $res->json('checklist.0.id');
        $res = $this->putJson("/api/nutrition/checklist/$vit", ['done' => true])->assertOk();
        $this->assertSame(1, $res->json('extras.done'));
        // other days are untouched
        $this->assertSame(0, $this->getJson('/api/nutrition?date=2026-11-22')->json('extras.done'));
        $this->assertSame(0, $this->putJson("/api/nutrition/checklist/$vit", ['done' => false])->json('extras.done'));

        $res = $this->postJson('/api/nutrition/checklist', ['name' => 'Creatine'])->assertCreated();
        $this->assertSame(4, $res->json('extras.total'));
        $this->deleteJson('/api/nutrition/checklist/'.$vit)->assertOk()->assertJsonPath('extras.total', 3);
    }

    public function test_checklist_is_private_and_capped(): void
    {
        $vit = $this->getJson('/api/nutrition')->json('checklist.0.id');
        $other = User::factory()->create();
        $this->actingAs($other)->putJson("/api/nutrition/checklist/$vit", ['done' => true])->assertNotFound();

        $this->actingAs($this->user);
        for ($i = 0; $i < 9; $i++) {
            $this->postJson('/api/nutrition/checklist', ['name' => "Item $i"])->assertCreated();
        }
        $this->postJson('/api/nutrition/checklist', ['name' => 'One too many'])->assertStatus(422);
    }

    public function test_calendar_marks_diet_and_achievement_days(): void
    {
        $id = $this->exercise();
        $this->lift($id, 60, '2026-11-23');
        $this->goodDay('2026-11-23');
        $this->eat(300, 10, '2026-11-22');

        $days = collect($this->getJson('/api/calendar?start=2026-11-22&days=2')->json('days'));
        $sun = $days->firstWhere('date', '2026-11-22');
        $mon = $days->firstWhere('date', '2026-11-23');
        $this->assertTrue($mon['diet']['ok']);
        $this->assertGreaterThanOrEqual(2, $mon['achievements']); // First Rep + On Target
        $this->assertTrue($sun['diet']['logged']);
        $this->assertFalse($sun['diet']['ok']);
    }

    public function test_day_journal_collects_everything(): void
    {
        $id = $this->exercise();
        $this->lift($id, 80, '2026-11-23');
        $this->goodDay('2026-11-23');
        $vit = $this->getJson('/api/nutrition')->json('checklist.0.id');
        $this->putJson("/api/nutrition/checklist/$vit", ['done' => true]);

        $res = $this->getJson('/api/days/2026-11-23')->assertOk();
        $res->assertJsonPath('gym.trained', true)->assertJsonPath('gym.logs.0.name', 'Bench press')
            ->assertJsonPath('gym.logs.0.weight', 80)
            ->assertJsonPath('diet.status.day_ok', true)->assertJsonPath('diet.checked.0', 'Vitamins')
            ->assertJsonPath('events', []);
        $this->assertContains('On Target', collect($res->json('achievements'))->pluck('name')->all());

        $this->getJson('/api/days/not-a-date')->assertNotFound();
        $this->getJson('/api/days/2026-11-22')->assertOk()->assertJsonPath('gym.trained', false)->assertJsonCount(0, 'achievements');
    }
}
