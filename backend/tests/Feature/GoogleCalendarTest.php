<?php

namespace Tests\Feature;

use App\Models\GoogleConnection;
use App\Models\GoogleEvent;
use App\Models\GooglePushed;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleCalendarTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    /** What our pretend Google holds. Tests change these between syncs. */
    private array $primaryEvents = [];

    private array $mayhemEvents = [];

    private bool $mayhemGone = false;

    private array $calls = [];

    private int $nextId = 1;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-24 10:00:00', 'Europe/Amsterdam'));
        config(['services.google.client_id' => 'cid', 'services.google.client_secret' => 'secret']);
        $this->user = User::factory()->create();
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function connect(): void
    {
        $this->user->googleConnection()->create(['access_token' => 'tok', 'refresh_token' => 'ref', 'expires_at' => now()->addHour()]);
        $this->user->unsetRelation('googleConnection'); // tests reuse one User object across requests
    }

    private function fakeGoogle(): void
    {
        Http::fake(function (Request $req) {
            $url = $req->url();
            $this->calls[] = $req->method().' '.preg_replace('#^https://www.googleapis.com/calendar/v3#', '', strtok($url, '?'));

            if (str_contains($url, '/users/me/calendarList')) {
                return Http::response(['items' => [
                    ['id' => 'primary@x.com', 'summary' => 'Me', 'selected' => true],
                    ['id' => 'hidden@x.com', 'summary' => 'Hidden', 'selected' => false],
                    ['id' => 'mayhem@group', 'summary' => 'Mayhem', 'selected' => true],
                ]]);
            }
            if ($req->method() === 'POST' && str_ends_with(strtok($url, '?'), '/calendars')) {
                return Http::response(['id' => 'mayhem@group']);
            }
            if ($req->method() === 'GET' && str_contains($url, '/calendars/primary%40x.com/events')) {
                return Http::response(['items' => $this->primaryEvents]);
            }
            if ($req->method() === 'GET' && str_contains($url, '/calendars/mayhem%40group/events')) {
                return $this->mayhemGone ? Http::response(['error' => ['message' => 'Not Found']], 404) : Http::response(['items' => array_values($this->mayhemEvents)]);
            }
            if ($req->method() === 'POST' && str_contains($url, '/calendars/mayhem%40group/events')) {
                $id = 'ev'.$this->nextId++;
                $this->mayhemEvents[$id] = ['id' => $id, 'status' => 'confirmed'] + $req->data();

                return Http::response(['id' => $id]);
            }
            if ($req->method() === 'PATCH') {
                return Http::response([]);
            }
            if ($req->method() === 'DELETE') {
                return Http::response('', 204);
            }

            return Http::response(['error' => ['message' => 'unexpected '.$url]], 500);
        });
    }

    private function sync()
    {
        return $this->postJson('/api/google/sync');
    }

    public function test_status_before_setup(): void
    {
        config(['services.google.client_id' => null]);
        $this->getJson('/api/google')->assertOk()->assertJsonPath('configured', false)->assertJsonPath('connected', false);
        $this->getJson('/api/google/connect')->assertStatus(422);
    }

    public function test_connect_gives_a_google_url_and_callback_stores_tokens(): void
    {
        $url = $this->getJson('/api/google/connect')->assertOk()->json('url');
        $this->assertStringContainsString('accounts.google.com', $url);
        $this->assertStringContainsString('access_type=offline', $url);
        parse_str(parse_url($url, PHP_URL_QUERY), $q);

        Http::fake(['oauth2.googleapis.com/token' => Http::response(['access_token' => 'A', 'refresh_token' => 'R', 'expires_in' => 3600])]);
        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();

        // the callback has no session: it is public and identified by the one-time state
        $this->get('/api/google/callback?code=abc&state='.$q['state'])->assertRedirect('http://localhost:5173/calendar?google=connected');

        $conn = GoogleConnection::where('user_id', $this->user->id)->first();
        $this->assertSame('A', $conn->access_token);
        $this->assertSame('R', $conn->refresh_token);
        $this->assertNotSame('A', $conn->getRawOriginal('access_token')); // stored encrypted
        $this->assertNull(Cache::get('google-oauth:'.$q['state'])); // single use
    }

    public function test_callback_rejects_unknown_state_and_denied(): void
    {
        $this->get('/api/google/callback?code=abc&state=nope')->assertRedirectContains('google=error');
        $this->get('/api/google/callback?error=access_denied')->assertRedirect('http://localhost:5173/calendar?google=denied');
    }

    public function test_sync_imports_events_and_pushes_quests(): void
    {
        $this->connect();
        $this->primaryEvents = [
            ['id' => 'e1', 'summary' => 'Dentist', 'start' => ['dateTime' => '2026-11-25T14:30:00+01:00'], 'end' => ['dateTime' => '2026-11-25T15:15:00+01:00'], 'htmlLink' => 'https://g/e1'],
            ['id' => 'e2', 'summary' => 'Holiday', 'start' => ['date' => '2026-11-27'], 'end' => ['date' => '2026-11-29']],
            ['id' => 'e3', 'status' => 'cancelled'],
        ];
        $this->fakeGoogle();
        $this->postJson('/api/tasks', ['title' => 'Call mum', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-26']])->assertCreated();
        $this->postJson('/api/tasks', ['title' => 'Stretch', 'tier' => 'E', 'schedule' => ['mode' => 'weekly', 'days' => [1, 2, 3, 4, 5, 6, 7]]])->assertCreated();
        $this->postJson('/api/tasks', ['title' => 'Someday', 'tier' => 'C'])->assertCreated(); // floating: never pushed

        $res = $this->sync()->assertOk();
        $this->assertSame(2, $res->json('result.imported'));
        $this->assertSame(['Dentist', 'Holiday'], GoogleEvent::orderBy('id')->pluck('title')->all());
        $this->assertNotContains('GET /calendars/hidden%40x.com/events', $this->calls);

        // pushed: Stretch x28 days + Call mum x1, floating quest not
        $this->assertSame(29, $res->json('result.created'));
        $this->assertSame(29, GooglePushed::count());
        $this->assertSame(0, GooglePushed::where('title', 'Someday')->count());
        $this->assertSame('mayhem@group', GoogleConnection::first()->mayhem_calendar_id);
        $this->assertTrue($res->json('connected'));

        // the calendar and journal now show google events
        $days = collect($this->getJson('/api/calendar?start=2026-11-24&days=6')->json('days'));
        $this->assertSame([], $days->firstWhere('date', '2026-11-24')['events']);
        $dentist = $days->firstWhere('date', '2026-11-25')['events'][0];
        $this->assertSame('Dentist', $dentist['title']);
        $this->assertSame('14:30', $dentist['start_time']);
        $this->assertFalse($dentist['all_day']);
        $this->assertSame('Holiday', $days->firstWhere('date', '2026-11-27')['events'][0]['title']);
        $this->assertSame('Holiday', $days->firstWhere('date', '2026-11-28')['events'][0]['title']); // 2-day all-day event
        $this->assertSame([], $days->firstWhere('date', '2026-11-29')['events']); // Google's end date is exclusive
        $this->assertSame('Dentist', $this->getJson('/api/days/2026-11-25')->json('events.0.title'));

        // syncing again changes nothing
        $again = $this->sync()->assertOk();
        $this->assertSame(0, $again->json('result.created'));
        $this->assertSame(29, GooglePushed::count());
        $this->assertSame(2, GoogleEvent::count());
    }

    public function test_completed_quests_get_a_check_mark_and_deleted_quests_leave_google(): void
    {
        $this->connect();
        $this->fakeGoogle();
        $a = $this->postJson('/api/tasks', ['title' => 'Read', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-24']])->json('data.id');
        $b = $this->postJson('/api/tasks', ['title' => 'Plan', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-25']])->json('data.id');
        $this->sync()->assertOk();
        $this->assertSame(2, GooglePushed::count());

        $this->postJson("/api/tasks/$a/complete")->assertOk();
        $this->deleteJson("/api/tasks/$b")->assertOk();
        $this->calls = [];
        $res = $this->sync()->assertOk();

        $this->assertSame(1, $res->json('result.updated'));
        $this->assertSame(1, $res->json('result.removed'));
        $this->assertSame('✓ Read', GooglePushed::first()->title);
        $this->assertSame(1, GooglePushed::count());
        $this->assertContains('PATCH /calendars/mayhem%40group/events/ev1', $this->calls);
        $this->assertContains('DELETE /calendars/mayhem%40group/events/ev2', $this->calls);
    }

    public function test_moving_a_quest_event_in_google_moves_the_quest(): void
    {
        $this->connect();
        $this->fakeGoogle();
        $id = $this->postJson('/api/tasks', ['title' => 'Haircut', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-26']])->json('data.id');
        $this->sync()->assertOk();

        $this->mayhemEvents['ev1']['start'] = ['date' => '2026-11-30'];
        $this->mayhemEvents['ev1']['end'] = ['date' => '2026-12-01'];
        $res = $this->sync()->assertOk();

        $this->assertSame(1, $res->json('result.moved'));
        $this->assertSame('2026-11-30', \App\Models\Task::find($id)->scheduled_date->toDateString());
        $this->assertSame('2026-11-30', GooglePushed::first()->date->toDateString());
        $this->assertSame(1, GooglePushed::count()); // not re-created on the old day
    }

    public function test_events_deleted_in_google_are_not_recreated(): void
    {
        $this->connect();
        $this->fakeGoogle();
        $this->postJson('/api/tasks', ['title' => 'Haircut', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-26']]);
        $this->sync()->assertOk();

        $this->mayhemEvents = [];
        $res = $this->sync()->assertOk();
        $this->assertSame(0, $res->json('result.created'));
        $this->assertSame('removed', GooglePushed::first()->status);
        // the quest itself is untouched
        $this->assertSame('2026-11-26', \App\Models\Task::first()->scheduled_date->toDateString());
    }

    public function test_deleted_mayhem_calendar_is_recreated(): void
    {
        $this->connect();
        $this->fakeGoogle();
        $this->postJson('/api/tasks', ['title' => 'Haircut', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-26']]);
        $this->sync()->assertOk();

        $this->mayhemGone = true;
        $this->mayhemEvents = [];
        $this->calls = [];
        // after the 404 the calendar is recreated and the events pushed again
        $this->sync()->assertOk();
        $this->assertContains('POST /calendars', $this->calls);
        $this->assertSame(1, GooglePushed::count());
    }

    public function test_events_cancelled_in_google_leave_the_cache(): void
    {
        $this->connect();
        $this->primaryEvents = [['id' => 'e1', 'summary' => 'Dentist', 'start' => ['dateTime' => '2026-11-25T14:30:00+01:00'], 'end' => ['dateTime' => '2026-11-25T15:00:00+01:00']]];
        $this->fakeGoogle();
        $this->sync();
        $this->assertSame(1, GoogleEvent::count());
        $this->primaryEvents = [];
        $this->sync();
        $this->assertSame(0, GoogleEvent::count());
    }

    public function test_push_can_be_switched_off(): void
    {
        $this->connect();
        $this->fakeGoogle();
        $this->postJson('/api/tasks', ['title' => 'Haircut', 'tier' => 'E', 'schedule' => ['mode' => 'date', 'date' => '2026-11-26']]);
        $this->putJson('/api/google/settings', ['push_enabled' => false])->assertOk()->assertJsonPath('push_enabled', false);
        $this->sync()->assertOk();
        $this->assertSame(0, GooglePushed::count());
        $this->assertNull(GoogleConnection::first()->mayhem_calendar_id);
    }

    public function test_expired_access_asks_to_reconnect(): void
    {
        $this->user->googleConnection()->create(['access_token' => 'tok', 'refresh_token' => 'ref', 'expires_at' => now()->subHour()]);
        Http::fake(['oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant'], 400)]);
        $res = $this->sync()->assertStatus(502);
        $this->assertTrue($res->json('reconnect'));
        $this->assertTrue($res->json('needs_reconnect'));
        $this->assertFalse($res->json('connected'));
    }

    public function test_a_refresh_token_renews_the_access_token(): void
    {
        $this->user->googleConnection()->create(['access_token' => 'old', 'refresh_token' => 'ref', 'expires_at' => now()->subMinute()]);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'new', 'expires_in' => 3600]),
            '*' => Http::response(['items' => []]),
        ]);
        $this->putJson('/api/google/settings', ['push_enabled' => false]);
        $this->sync()->assertOk();
        $this->assertSame('new', GoogleConnection::first()->access_token);
    }

    public function test_disconnect_forgets_everything(): void
    {
        $this->connect();
        $this->primaryEvents = [['id' => 'e1', 'summary' => 'Dentist', 'start' => ['date' => '2026-11-25'], 'end' => ['date' => '2026-11-26']]];
        $this->fakeGoogle();
        Http::fake(['oauth2.googleapis.com/revoke' => Http::response('')] + []);
        $this->fakeGoogle();
        $this->sync();
        $this->deleteJson('/api/google')->assertOk()->assertJsonPath('connected', false);
        $this->assertSame(0, GoogleEvent::count());
        $this->assertSame(0, GoogleConnection::count());
    }

    public function test_sync_needs_a_connection_and_is_private(): void
    {
        $this->sync()->assertStatus(422);
        $this->connect();
        $this->putJson('/api/google/settings', ['push_enabled' => false]);
        Http::fake(['*' => Http::response(['items' => []])]);
        $this->sync()->assertOk();
        // another user sees no Google data of yours
        $other = User::factory()->create();
        $this->actingAs($other)->getJson('/api/google')->assertJsonPath('connected', false);
    }
}
