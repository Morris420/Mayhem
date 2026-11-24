<?php

namespace Tests\Feature;

use App\Models\CoachMessage;
use App\Models\CoachProposal;
use App\Models\GoogleEvent;
use App\Models\Task;
use App\Models\User;
use App\Support\Coach\CoachProvider;
use Database\Seeders\SkillSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** A stand-in for Gemini: it answers whatever the test tells it to, and remembers what it was asked. */
class FakeCoachProvider implements CoachProvider
{
    public array $answer = ['reply' => 'Good work this week.', 'quests' => []];

    public ?string $system = null;

    public array $messages = [];

    public int $calls = 0;

    public function label(): string
    {
        return 'Fake';
    }

    public function configured(): bool
    {
        return true;
    }

    public function json(string $system, array $messages, array $schema): array
    {
        $this->calls++;
        $this->system = $system;
        $this->messages = $messages;

        return $this->answer;
    }
}

class CoachTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private FakeCoachProvider $ai;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:00:00', 'Europe/Amsterdam'));
        $this->seed(SkillSeeder::class);
        $this->ai = new FakeCoachProvider;
        $this->app->instance(CoachProvider::class, $this->ai);
        $this->user = User::factory()->create(['username' => 'morris']);
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function quest(array $overrides = []): array
    {
        return $overrides + [
            'title' => 'Walk 30 minutes after dinner',
            'description' => 'A brisk walk, phone in your pocket.',
            'tier' => 'D',
            'skill' => 'stamina',
            'schedule_mode' => 'weekly',
            'weekdays' => [1, 3, 5],
            'reason' => 'You have no cardio in your week.',
        ];
    }

    public function test_the_coach_answers_and_suggests_quests_without_creating_them(): void
    {
        $this->ai->answer = ['reply' => 'Your legs are behind.', 'quests' => [$this->quest()]];

        $res = $this->postJson('/api/coach/messages', ['message' => 'What should I do this week?'])->assertOk();

        $this->assertSame(['user', 'coach'], collect($res->json('messages'))->pluck('role')->all());
        $this->assertSame('Your legs are behind.', $res->json('messages.1.content'));

        $p = $res->json('messages.1.proposals.0');
        $this->assertSame('Walk 30 minutes after dinner', $p['title']);
        $this->assertSame('stamina', $p['skill']['slug']);
        $this->assertSame(['mode' => 'weekly', 'days' => [1, 3, 5]], $p['schedule']);
        $this->assertSame('pending', $p['status']);

        // nothing exists in the quest library until it is accepted
        $this->assertSame(0, Task::count());
        $this->assertSame(1, $res->json('limits.messages.used'));
    }

    public function test_accepting_a_proposal_creates_the_quest(): void
    {
        $this->ai->answer = ['reply' => 'Here.', 'quests' => [$this->quest()]];
        $id = $this->postJson('/api/coach/messages', ['message' => 'go'])->json('messages.1.proposals.0.id');

        $res = $this->postJson("/api/coach/proposals/$id/accept")->assertOk();

        $this->assertSame('Walk 30 minutes after dinner', $res->json('task.title'));
        $this->assertSame('stamina', $res->json('task.skill.slug'));
        $this->assertSame([1, 3, 5], $res->json('task.schedule.days'));
        $this->assertSame(25, $res->json('task.xp')); // D-rank
        $this->assertSame('accepted', $res->json('messages.1.proposals.0.status'));
        $this->assertSame(1, $res->json('limits.quests.used'));

        $this->postJson("/api/coach/proposals/$id/accept")->assertStatus(422); // only once
        $this->assertSame(1, Task::count());
    }

    public function test_dismissing_leaves_no_quest(): void
    {
        $this->ai->answer = ['reply' => 'Here.', 'quests' => [$this->quest()]];
        $id = $this->postJson('/api/coach/messages', ['message' => 'go'])->json('messages.1.proposals.0.id');

        $res = $this->postJson("/api/coach/proposals/$id/dismiss")->assertOk();
        $this->assertSame('dismissed', $res->json('messages.1.proposals.0.status'));
        $this->assertSame(0, Task::count());
    }

    public function test_the_coach_sees_the_hunters_data_but_not_google(): void
    {
        $this->user->forceFill(['coach_profile' => 'I want to bench 100kg.'])->save();
        $task = $this->postJson('/api/tasks', ['title' => 'Read 20 pages', 'tier' => 'C'])->json('data.id');
        $this->postJson("/api/tasks/$task/complete")->assertOk();
        $this->user->googleConnection()->create(['access_token' => 't', 'refresh_token' => 'r', 'expires_at' => now()->addHour()]);
        GoogleEvent::create([
            'user_id' => $this->user->id, 'calendar_id' => 'c', 'google_id' => 'g', 'title' => 'Dentist appointment',
            'start_date' => '2026-11-26', 'end_date' => '2026-11-26',
        ]);

        $this->postJson('/api/coach/messages', ['message' => 'hi'])->assertOk();

        $this->assertStringContainsString('I want to bench 100kg.', $this->ai->system);
        $this->assertStringContainsString('Read 20 pages', $this->ai->system);
        $this->assertStringContainsString('slug: discipline', $this->ai->system);
        $this->assertStringContainsString('morris', $this->ai->system);
        $this->assertStringNotContainsString('Dentist appointment', $this->ai->system);
    }

    public function test_bad_suggestions_are_dropped(): void
    {
        $this->postJson('/api/tasks', ['title' => 'Walk 30 minutes after dinner', 'tier' => 'E'])->assertCreated();
        $this->ai->answer = ['reply' => 'ok', 'quests' => [
            $this->quest(),                                                  // already in the library
            $this->quest(['title' => 'Z-rank nonsense', 'tier' => 'Z']),     // tier that does not exist
            $this->quest(['title' => '', 'tier' => 'C']),                    // no title
            $this->quest(['title' => 'Old plan', 'schedule_mode' => 'date', 'date' => '2020-01-01']),
            $this->quest(['title' => 'Mystery skill', 'skill' => 'wizardry']),
        ]];

        $res = $this->postJson('/api/coach/messages', ['message' => 'go'])->assertOk();
        $proposals = collect($res->json('messages.1.proposals'));

        $this->assertSame(['Old plan', 'Mystery skill'], $proposals->pluck('title')->all());
        $this->assertSame(['mode' => 'none'], $proposals->firstWhere('title', 'Old plan')['schedule']); // past date dropped
        $this->assertSame('discipline', $proposals->firstWhere('title', 'Mystery skill')['skill']['slug']);
    }

    public function test_at_most_four_quests_per_answer(): void
    {
        $this->ai->answer = ['reply' => 'ok', 'quests' => collect(range(1, 9))->map(fn ($i) => $this->quest(['title' => "Quest $i"]))->all()];

        $this->postJson('/api/coach/messages', ['message' => 'go'])->assertOk();
        $this->assertSame(4, CoachProposal::count());
    }

    public function test_the_daily_briefing_is_generated_once_a_day(): void
    {
        $this->ai->answer = ['reply' => 'Morning. Three days without a workout.', 'quests' => []];

        $first = $this->postJson('/api/coach/daily')->assertOk();
        $this->assertTrue($first->json('has_daily'));
        $this->assertSame(1, $this->ai->calls);

        $this->postJson('/api/coach/daily')->assertOk();
        $this->assertSame(1, $this->ai->calls); // same day: no second call
        $this->assertSame(2, CoachMessage::count());

        Carbon::setTestNow(Carbon::parse('2026-11-26 09:00:00', 'Europe/Amsterdam'));
        $this->postJson('/api/coach/daily')->assertOk();
        $this->assertSame(2, $this->ai->calls);
    }

    public function test_the_daily_message_limit_holds(): void
    {
        config(['services.coach.daily_messages' => 2]);

        $this->postJson('/api/coach/messages', ['message' => 'one'])->assertOk();
        $this->postJson('/api/coach/messages', ['message' => 'two'])->assertOk();
        $this->postJson('/api/coach/messages', ['message' => 'three'])->assertStatus(429);

        $this->assertSame(2, $this->ai->calls);
    }

    public function test_the_daily_quest_limit_holds(): void
    {
        config(['services.coach.daily_quests' => 1]);
        $this->ai->answer = ['reply' => 'ok', 'quests' => [$this->quest(['title' => 'A']), $this->quest(['title' => 'B'])]];
        $ids = collect($this->postJson('/api/coach/messages', ['message' => 'go'])->json('messages.1.proposals'))->pluck('id');

        $this->postJson("/api/coach/proposals/{$ids[0]}/accept")->assertOk();
        $this->postJson("/api/coach/proposals/{$ids[1]}/accept")->assertStatus(429);
        $this->assertSame(1, Task::count());
    }

    public function test_history_is_sent_back_so_the_coach_remembers(): void
    {
        $this->postJson('/api/coach/messages', ['message' => 'first'])->assertOk();
        $this->postJson('/api/coach/messages', ['message' => 'second'])->assertOk();

        $this->assertSame(
            ['user' => 'first', 'coach' => 'Good work this week.', 'user2' => 'second'],
            ['user' => $this->ai->messages[0]['content'], 'coach' => $this->ai->messages[1]['content'], 'user2' => $this->ai->messages[2]['content']],
        );
    }

    public function test_the_profile_is_saved_and_the_conversation_can_be_cleared(): void
    {
        $this->putJson('/api/coach/profile', ['profile' => 'Father of two, works nights.'])->assertOk()
            ->assertJsonPath('profile', 'Father of two, works nights.');

        $this->postJson('/api/coach/messages', ['message' => 'go'])->assertOk();
        $this->deleteJson('/api/coach')->assertOk()->assertJsonPath('messages', []);
        $this->assertSame('Father of two, works nights.', $this->user->fresh()->coach_profile);
    }

    public function test_another_hunters_proposal_is_out_of_reach(): void
    {
        $this->ai->answer = ['reply' => 'ok', 'quests' => [$this->quest()]];
        $id = $this->postJson('/api/coach/messages', ['message' => 'go'])->json('messages.1.proposals.0.id');

        $this->actingAs(User::factory()->create());
        $this->postJson("/api/coach/proposals/$id/accept")->assertNotFound();
    }

    public function test_the_coach_page_works_before_a_key_is_set(): void
    {
        $this->app->forgetInstance(CoachProvider::class);
        config(['services.coach.provider' => 'gemini', 'services.gemini.key' => null]);

        $this->getJson('/api/coach')->assertOk()->assertJsonPath('configured', false);
    }

    public function test_gemini_is_called_the_way_google_expects(): void
    {
        $this->app->forgetInstance(CoachProvider::class);
        config(['services.coach.provider' => 'gemini', 'services.gemini.key' => 'k-123', 'services.gemini.model' => 'gemini-3.1-flash-lite']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => json_encode(['reply' => 'Hello hunter.', 'quests' => []])]]]]],
        ])]);

        $this->postJson('/api/coach/messages', ['message' => 'hi'])->assertOk()
            ->assertJsonPath('messages.1.content', 'Hello hunter.');

        Http::assertSent(function ($request) {
            $body = $request->data();

            return str_contains($request->url(), 'models/gemini-3.1-flash-lite:generateContent')
                && $request->header('x-goog-api-key') === ['k-123']
                && $body['generationConfig']['responseMimeType'] === 'application/json'
                && $body['generationConfig']['responseSchema']['type'] === 'OBJECT'
                && $body['contents'][0]['role'] === 'user'
                && str_contains($body['systemInstruction']['parts'][0]['text'], 'You are the System');
        });
    }

    public function test_a_provider_failure_is_explained_not_crashed(): void
    {
        $this->app->forgetInstance(CoachProvider::class);
        config(['services.coach.provider' => 'gemini', 'services.gemini.key' => 'k-123']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'quota']], 429)]);

        $this->postJson('/api/coach/messages', ['message' => 'hi'])->assertStatus(429)
            ->assertJsonPath('message', "Gemini's free limit for today is used up. Try again later.");

        // our own message is kept, so nothing is lost
        $this->assertSame(1, CoachMessage::count());
    }

    public function test_the_coach_is_private(): void
    {
        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/coach')->assertStatus(401);
    }
}
