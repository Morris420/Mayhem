<?php

namespace Tests\Feature;

use App\Models\Achievement;
use App\Models\User;
use Database\Seeders\AchievementSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ScheduleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        // Wednesday 18 Nov 2026
        Carbon::setTestNow(Carbon::parse('2026-11-18 10:00:00'));
        $this->seed(AchievementSeeder::class);
        $this->user = User::factory()->create();
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function quest(array $extra = []): int
    {
        return $this->postJson('/api/tasks', ['title' => 'Stretch', 'tier' => 'E'] + $extra)->assertCreated()->json('data.id');
    }

    public function test_weekly_quest_shows_only_on_its_days_and_completes_per_day(): void
    {
        $id = $this->quest(['schedule' => ['mode' => 'weekly', 'days' => [1, 3]]]); // Mon + Wed

        $cal = $this->getJson('/api/calendar?start=2026-11-16&days=7')->assertOk();
        $days = collect($cal->json('days'));
        // Monday is before the quest existed -> must not appear
        $this->assertSame(0, $days[0]['total']);
        $this->assertSame(1, $days[2]['total']);   // Wed (today)
        $this->assertSame(0, $days[1]['total']);

        $this->postJson("/api/tasks/$id/complete")->assertOk()->assertJsonPath('awarded', 10);
        $this->postJson("/api/tasks/$id/complete")->assertOk()->assertJsonPath('awarded', 0);

        $today = $this->getJson('/api/dashboard')->json('today');
        $this->assertSame(1, $today['done']);

        // next Monday it is open again
        $next = $this->getJson('/api/calendar?start=2026-11-23&days=1')->json('days.0');
        $this->assertSame(1, $next['total']);
        $this->assertSame(0, $next['done']);
    }

    public function test_recurring_quest_cannot_be_completed_on_a_non_scheduled_day(): void
    {
        $id = $this->quest(['schedule' => ['mode' => 'weekly', 'days' => [1]]]); // Monday only; today is Wed
        $this->postJson("/api/tasks/$id/complete")->assertUnprocessable();
        $this->assertSame(0, $this->user->fresh()->xp);
    }

    public function test_every_day_schedule(): void
    {
        $this->quest(['schedule' => ['mode' => 'weekly', 'days' => [1, 2, 3, 4, 5, 6, 7]]]);
        $this->assertSame(7, collect($this->getJson('/api/calendar?start=2026-11-18&days=7')->json('days'))->sum('total'));
    }

    public function test_dated_quest_and_overdue(): void
    {
        $id = $this->quest(['schedule' => ['mode' => 'date', 'date' => '2026-11-16']]); // two days ago
        $today = $this->getJson('/api/dashboard')->json('today.items.0');
        $this->assertTrue($today['overdue']);

        $this->postJson("/api/tasks/$id/complete")->assertOk();
        $this->assertTrue($this->getJson('/api/calendar?start=2026-11-16&days=1')->json('days.0.items.0.done'));
    }

    public function test_library_quest_can_be_assigned_later(): void
    {
        $id = $this->quest();
        $this->putJson("/api/tasks/$id/schedule", ['mode' => 'weekly', 'days' => [3, 5]])
            ->assertOk()->assertJsonPath('data.schedule.mode', 'weekly')->assertJsonPath('data.schedule.days', [3, 5]);
        $this->putJson("/api/tasks/$id/schedule", ['mode' => 'none'])->assertOk()->assertJsonPath('data.schedule.mode', 'none');
    }

    public function test_schedule_validation(): void
    {
        $this->postJson('/api/tasks', ['title' => 'x', 'tier' => 'E', 'schedule' => ['mode' => 'weekly', 'days' => [9]]])
            ->assertUnprocessable();
        $this->postJson('/api/tasks', ['title' => 'x', 'tier' => 'E', 'schedule' => ['mode' => 'weekly']])
            ->assertUnprocessable();
    }

    public function test_deleting_a_quest_keeps_its_xp_history(): void
    {
        $id = $this->quest();
        $this->postJson("/api/tasks/$id/complete")->assertOk();
        $this->deleteJson("/api/tasks/$id")->assertOk();

        $this->getJson('/api/tasks')->assertOk()->assertJsonCount(0, 'data');
        $dash = $this->getJson('/api/dashboard');
        $dash->assertJsonPath('stats.completions', 1)->assertJsonPath('stats.streak', 1)->assertJsonPath('user.xp', 10);
    }

    public function test_custom_achievements(): void
    {
        $id = $this->postJson('/api/achievements', ['name' => 'Read 10 books', 'description' => 'Finish ten books', 'icon' => 'book', 'tier' => 'A'])
            ->assertCreated()->assertJsonPath('custom', true)->json('id');

        $this->postJson('/api/achievements', ['name' => 'x', 'description' => 'y', 'icon' => 'bogus', 'tier' => 'A'])->assertUnprocessable();

        // can be linked to a quest, and unlocked
        $task = $this->quest(['achievement_id' => $id]);
        $this->postJson("/api/tasks/$task/complete")->assertOk()->assertJsonPath('unlocked.name', 'Read 10 books');

        // other users can neither see, link nor delete it
        $other = User::factory()->create();
        $this->actingAs($other);
        $this->assertFalse(collect($this->getJson('/api/achievements')->json())->contains('id', $id));
        $this->postJson('/api/tasks', ['title' => 'z', 'tier' => 'E', 'achievement_id' => $id])->assertUnprocessable();
        $this->deleteJson("/api/achievements/$id")->assertNotFound();

        // built-ins cannot be deleted
        $builtin = Achievement::whereNull('user_id')->first();
        $this->deleteJson("/api/achievements/{$builtin->id}")->assertNotFound();
    }
}
