<?php

namespace Tests\Feature;

use App\Models\Achievement;
use App\Models\User;
use Database\Seeders\AchievementSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AchievementSeeder::class);
        $this->user = User::factory()->create();
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    public function test_xp_is_set_from_tier_on_the_server(): void
    {
        $this->postJson('/api/tasks', ['title' => 'Run 5k', 'tier' => 'B', 'xp' => 99999])
            ->assertCreated()->assertJsonPath('data.xp', 100);
    }

    public function test_validation(): void
    {
        $this->postJson('/api/tasks', ['title' => '', 'tier' => 'Z'])
            ->assertUnprocessable()->assertJsonValidationErrors(['title', 'tier']);
    }

    public function test_completing_a_linked_task_awards_xp_and_unlocks_achievement(): void
    {
        $medal = Achievement::where('slug', 'golden-medal')->first();

        $id = $this->postJson('/api/tasks', ['title' => 'Run 20+ km', 'tier' => 'S', 'achievement_id' => $medal->id])
            ->json('data.id');

        $this->postJson("/api/tasks/$id/complete")
            ->assertOk()
            ->assertJsonPath('task.id', $id)
            ->assertJsonPath('user.xp', 400)
            ->assertJsonPath('user.level', 3)      // 400 xp -> level 3 (needs 300)
            ->assertJsonPath('leveled_up', true)
            ->assertJsonPath('unlocked.name', 'Golden Medal: Marathon');

        // Completing again must not double-award.
        $this->postJson("/api/tasks/$id/complete")->assertOk()->assertJsonPath('user.xp', 400);

        $dash = $this->getJson('/api/dashboard')->assertOk();
        $dash->assertJsonPath('stats.completions', 1)->assertJsonPath('stats.streak', 1)->assertJsonPath('stats.achievements_unlocked', 1);
        $this->assertTrue(collect($dash->json('achievements'))->firstWhere('id', $medal->id)['unlocked']);
    }

    public function test_achievement_needs_all_linked_tasks_and_shows_progress(): void
    {
        $a = Achievement::where('slug', 'centurion')->first();
        $one = $this->postJson('/api/tasks', ['title' => 'Pushups AM', 'tier' => 'E', 'achievement_id' => $a->id])->json('data.id');
        $this->postJson('/api/tasks', ['title' => 'Pushups PM', 'tier' => 'E', 'achievement_id' => $a->id]);

        $this->postJson("/api/tasks/$one/complete")->assertJsonPath('unlocked', null);

        $card = collect($this->getJson('/api/dashboard')->json('achievements'))->firstWhere('id', $a->id);
        $this->assertFalse($card['unlocked']);
        $this->assertSame(50, $card['progress']['pct']);
    }

    public function test_cannot_touch_another_users_task(): void
    {
        $other = User::factory()->create();
        $theirs = $other->tasks()->create(['title' => 'secret', 'tier' => 'E', 'xp' => 10]);

        $this->postJson("/api/tasks/{$theirs->id}/complete")->assertNotFound();
        $this->deleteJson("/api/tasks/{$theirs->id}")->assertNotFound();
        $this->assertSame(0, $this->user->fresh()->xp);
    }
}
