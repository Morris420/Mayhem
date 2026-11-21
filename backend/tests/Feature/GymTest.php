<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\GymPlanner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class GymTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-18 10:00:00')); // Wednesday
        $this->user = User::factory()->create();
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function exercise(array $extra = []): int
    {
        return $this->postJson('/api/gym/exercises', $extra + ['name' => 'Bench press', 'body_part' => 'chest', 'weekdays' => [1, 3]])
            ->assertCreated()->json('id');
    }

    public function test_empty_gym(): void
    {
        $this->getJson('/api/gym')->assertOk()
            ->assertJsonCount(0, 'exercises')->assertJsonCount(7, 'week.days')
            ->assertJsonPath('physique.stage', 1)->assertJsonPath('stats.sessions', 0);
    }

    public function test_week_shows_body_parts_of_scheduled_exercises(): void
    {
        $this->exercise();
        $this->exercise(['name' => 'Squat', 'body_part' => 'legs', 'weekdays' => [3]]);

        $days = collect($this->getJson('/api/gym')->json('week.days'));
        $this->assertSame(['chest'], $days[0]['body_parts']);              // Monday
        $this->assertSame(['chest', 'legs'], $days[2]['body_parts']);      // Wednesday (today)
        $this->assertTrue($days[2]['is_today']);
        $this->assertSame([], $days[1]['body_parts']);                      // Tuesday = rest
    }

    public function test_logging_tracks_current_previous_change_and_records(): void
    {
        $id = $this->exercise();
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 60, 'date' => '2026-11-09']);
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 65, 'sets' => 3, 'reps' => 8, 'date' => '2026-11-16']);
        $res = $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 62.5])->assertOk(); // today

        $ex = $res->json('exercises.0');
        $this->assertEquals(62.5, $ex['current']['weight']);
        $this->assertEquals(65.0, $ex['previous']['weight']);
        $this->assertEquals(-2.5, $ex['change']);
        $this->assertEquals(65.0, $ex['best']);
        $this->assertEquals(1, $ex['records']);          // 60 -> 65 was one new record
        $this->assertTrue($ex['logged_today']);
        $this->assertCount(3, $ex['history']);
        $res->assertJsonPath('stats.sessions', 3);
    }

    public function test_logging_twice_on_one_day_edits_the_entry(): void
    {
        $id = $this->exercise();
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 50]);
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 52.5])
            ->assertJsonPath('exercises.0.current.weight', 52.5)->assertJsonCount(1, 'exercises.0.history');
    }

    public function test_goal_progress(): void
    {
        $id = $this->exercise(['goal_weight' => 100, 'goal_date' => '2026-12-31']);
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 60, 'date' => '2026-11-10']);
        $goal = $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 80])->json('exercises.0.goal');

        $this->assertSame(50, $goal['pct']);       // 60 -> 100, now 80
        $this->assertFalse($goal['reached']);
        $this->assertSame(43, $goal['days_left']);

        $goal = $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 100])->json('exercises.0.goal');
        $this->assertTrue($goal['reached']);
        $this->assertSame(100, $goal['pct']);
    }

    public function test_goal_needs_a_date_and_validation(): void
    {
        $this->postJson('/api/gym/exercises', ['name' => 'x', 'body_part' => 'chest', 'goal_weight' => 80])->assertUnprocessable()->assertJsonValidationErrors('goal_date');
        $this->postJson('/api/gym/exercises', ['name' => '', 'body_part' => 'toes', 'weekdays' => [9]])->assertUnprocessable()->assertJsonValidationErrors(['name', 'body_part', 'weekdays.0']);
        $id = $this->exercise();
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => -1])->assertUnprocessable();
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 50, 'date' => '2027-01-01'])->assertUnprocessable();
    }

    public function test_physique_stage_grows_with_sessions(): void
    {
        $this->assertSame(1, GymPlanner::physique(5)['stage']);
        $this->assertSame(2, GymPlanner::physique(6)['stage']);
        $this->assertSame(5, GymPlanner::physique(500)['stage']);
        $this->assertNull(GymPlanner::physique(500)['next']);
        $p = GymPlanner::physique(13);
        $this->assertSame(2, $p['stage']);
        $this->assertSame(7, $p['next']['remaining']);   // stage 3 at 20 sessions
        $this->assertSame(50, $p['next']['pct']);

        $id = $this->exercise(['weekdays' => []]);
        foreach (range(1, 6) as $i) {
            $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 40 + $i, 'date' => '2026-11-0'.$i]);
        }
        $this->getJson('/api/gym')->assertJsonPath('physique.stage', 2);
    }

    public function test_deleting_exercise_keeps_sessions_and_is_private(): void
    {
        $id = $this->exercise();
        $this->postJson("/api/gym/exercises/$id/logs", ['weight' => 50]);
        $this->deleteJson("/api/gym/exercises/$id")->assertOk()->assertJsonCount(0, 'exercises')->assertJsonPath('stats.sessions', 1);

        $other = User::factory()->create();
        $theirs = $other->exercises()->create(['name' => 'secret', 'body_part' => 'arms']);
        $this->postJson("/api/gym/exercises/{$theirs->id}/logs", ['weight' => 10])->assertNotFound();
        $this->putJson("/api/gym/exercises/{$theirs->id}", ['name' => 'x', 'body_part' => 'arms'])->assertNotFound();
        $this->deleteJson("/api/gym/exercises/{$theirs->id}")->assertNotFound();
    }

    public function test_starter_plan_once_and_calendar_shows_workouts(): void
    {
        $this->postJson('/api/gym/starter')->assertCreated();
        $this->assertGreaterThan(8, $this->user->exercises()->count());
        $this->postJson('/api/gym/starter')->assertUnprocessable();

        $day = $this->getJson('/api/calendar?start=2026-11-16&days=1')->json('days.0'); // Monday = push
        $this->assertContains('chest', $day['workout']['body_parts']);
        $this->assertFalse($day['workout']['trained']);
    }
}
