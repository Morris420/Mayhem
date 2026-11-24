<?php

namespace App\Support\Google;

use App\Models\GoogleConnection;
use App\Models\GoogleEvent;
use App\Models\GooglePushed;
use App\Models\User;
use App\Support\QuestPlanner;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Two-way sync with Google Calendar.
 *
 *  pull: your Google events are copied into Mayhem (read-only here); dates you moved in the
 *        "Mayhem" calendar change the matching dated quest.
 *  push: upcoming quests become all-day events in a separate "Mayhem" calendar, so your real
 *        calendars are never touched.
 */
class GoogleCalendarSync
{
    public const DAYS_BACK = 14;

    public const DAYS_AHEAD = 60;

    public const PUSH_DAYS = 28;

    private const MAX_CREATES = 150;

    private const MAX_LOOKUPS = 25;

    private array $errors = [];

    public function __construct(private GoogleClient $google, private QuestPlanner $planner) {}

    /** @return array{imported: int, created: int, updated: int, removed: int, moved: int, errors: list<string>} */
    public function run(User $user): array
    {
        // One sync per person at a time: two at once would both create the same event in Google.
        $lock = Cache::lock("google-sync:{$user->id}", 120);
        if (! $lock->get()) {
            throw new GoogleException('A sync is already running. Give it a moment.', false, 409);
        }

        try {
            return $this->runLocked($user);
        } finally {
            $lock->release();
        }
    }

    private function runLocked(User $user): array
    {
        $conn = $user->googleConnection;
        $this->errors = [];
        $stats = ['imported' => 0, 'created' => 0, 'updated' => 0, 'removed' => 0, 'moved' => 0, 'errors' => []];

        $from = now()->startOfDay()->subDays(self::DAYS_BACK);
        $to = now()->startOfDay()->addDays(self::DAYS_AHEAD);

        $mayhemEvents = $conn->mayhem_calendar_id ? $this->pullMayhemCalendar($conn, $from, $to) : null;
        if ($mayhemEvents === null && $conn->mayhem_calendar_id) {
            // the calendar was deleted in Google: forget it and what we pushed, it gets recreated below
            GooglePushed::where('user_id', $user->id)->delete();
            $conn->forceFill(['mayhem_calendar_id' => null])->save();
        }
        if ($mayhemEvents !== null) {
            $stats['moved'] = $this->applyChangesFromGoogle($user, $mayhemEvents);
        }

        $stats['imported'] = $this->pullCalendars($user, $conn, $from, $to);

        if ($conn->push_enabled) {
            $push = $this->push($user, $conn);
            $stats = array_merge($stats, array_intersect_key($push, array_flip(['created', 'updated', 'removed'])));
        }

        $conn->forceFill(['last_synced_at' => now()])->save();
        $stats['errors'] = $this->errors;

        return $stats;
    }

    // --- pull -------------------------------------------------------------

    /** @return int number of events now cached */
    private function pullCalendars(User $user, GoogleConnection $conn, CarbonInterface $from, CarbonInterface $to): int
    {
        $list = $this->google->call($conn, 'GET', '/users/me/calendarList', ['minAccessRole' => 'reader'])['items'] ?? [];
        $calendars = collect($list)->filter(fn ($c) => ($c['selected'] ?? false) && ($c['id'] ?? null) !== $conn->mayhem_calendar_id);

        $count = 0;
        $okCalendars = [];
        foreach ($calendars as $cal) {
            try {
                $events = $this->listEvents($conn, $cal['id'], $from, $to);
            } catch (GoogleException $e) {
                if ($e->needsReconnect) {
                    throw $e;
                }
                $okCalendars[] = $cal['id']; // keep what we had for it
                $this->errors[] = ($cal['summaryOverride'] ?? $cal['summary'] ?? 'A calendar').': '.$e->getMessage();

                continue;
            }

            $okCalendars[] = $cal['id'];
            $seen = [];
            foreach ($events as $ev) {
                $row = $this->parse($ev);
                if (! $row) {
                    continue;
                }
                $seen[] = $ev['id'];
                GoogleEvent::updateOrCreate(
                    ['user_id' => $user->id, 'calendar_id' => $cal['id'], 'google_id' => $ev['id']],
                    $row + ['calendar_name' => $cal['summaryOverride'] ?? $cal['summary'] ?? null, 'link' => $ev['htmlLink'] ?? null],
                );
            }
            $count += count($seen);

            // Cancelled/removed events leave the cache, but only inside the window we looked at.
            GoogleEvent::where('user_id', $user->id)->where('calendar_id', $cal['id'])
                ->whereNotIn('google_id', $seen)
                ->whereDate('end_date', '>=', $from->toDateString())->whereDate('start_date', '<=', $to->toDateString())
                ->delete();
        }

        // calendars you hid or lost access to
        GoogleEvent::where('user_id', $user->id)->whereNotIn('calendar_id', $okCalendars ?: ['-'])->delete();

        return $count;
    }

    /** @return array<string, array>|null events of the Mayhem calendar keyed by id; null if the calendar is gone */
    private function pullMayhemCalendar(GoogleConnection $conn, CarbonInterface $from, CarbonInterface $to): ?array
    {
        try {
            return collect($this->listEvents($conn, $conn->mayhem_calendar_id, $from, $to, true))->keyBy('id')->all();
        } catch (GoogleException $e) {
            if ($e->status === 404 || $e->status === 410) {
                return null;
            }
            throw $e;
        }
    }

    /** Dates you moved in Google change the dated quest; events you deleted are not recreated. */
    private function applyChangesFromGoogle(User $user, array $events): int
    {
        $moved = 0;
        $lookups = 0;
        $rows = GooglePushed::where('user_id', $user->id)->where('status', 'synced')
            ->whereDate('date', '>=', now()->startOfDay()->subDays(self::DAYS_BACK)->toDateString())->get();

        foreach ($rows as $row) {
            $ev = $events[$row->google_event_id] ?? null;
            if (! $ev) {
                // Not in the window we listed: it was moved out of it (or really deleted). Ask Google directly.
                if ($lookups++ >= self::MAX_LOOKUPS) {
                    continue; // the rest follows on the next sync
                }
                $ev = $this->fetchEvent($user, $row);
                if ($ev === false) {
                    continue; // could not tell: leave it alone
                }
            }
            if (! $ev || ($ev['status'] ?? '') === 'cancelled') {
                $row->update(['status' => 'removed']);

                continue;
            }
            $newDate = $ev['start']['date'] ?? null;
            if ($newDate && $newDate !== $row->date->toDateString()) {
                $task = $user->tasks()->find($row->task_id);
                if ($task && ! $task->isRecurring() && $task->scheduled_date?->toDateString() === $row->date->toDateString()) {
                    $task->update(['scheduled_date' => $newDate]);
                    $row->update(['date' => $newDate]);
                    $moved++;
                }
                // a moved occurrence of a repeating quest is left alone: the weekly pattern wins
            }
        }

        return $moved;
    }

    /** @return array|null|false the event, null if it is gone for good, false if Google could not tell us */
    private function fetchEvent(User $user, GooglePushed $row): array|null|false
    {
        $conn = $user->googleConnection;
        try {
            return $this->google->call($conn, 'GET', '/calendars/'.rawurlencode($conn->mayhem_calendar_id).'/events/'.rawurlencode($row->google_event_id));
        } catch (GoogleException $e) {
            if (in_array($e->status, [404, 410], true)) {
                return null;
            }
            if ($e->needsReconnect) {
                throw $e;
            }
            $this->errors[] = $e->getMessage();

            return false;
        }
    }

    private function listEvents(GoogleConnection $conn, string $calendarId, CarbonInterface $from, CarbonInterface $to, bool $showDeleted = false): array
    {
        $out = [];
        $pageToken = null;
        for ($page = 0; $page < 5; $page++) {
            $res = $this->google->call($conn, 'GET', '/calendars/'.rawurlencode($calendarId).'/events', array_filter([
                'singleEvents' => 'true',
                'orderBy' => 'startTime',
                'timeMin' => $from->copy()->toRfc3339String(),
                'timeMax' => $to->copy()->addDay()->toRfc3339String(),
                'timeZone' => config('app.timezone'),
                'showDeleted' => $showDeleted ? 'true' : null, // deleted events come back as status=cancelled
                'maxResults' => 250,
                'pageToken' => $pageToken,
            ]));
            array_push($out, ...($res['items'] ?? []));
            $pageToken = $res['nextPageToken'] ?? null;
            if (! $pageToken) {
                break;
            }
        }

        return $out;
    }

    /** One Google event -> our columns. dateTime strings already carry your timezone. */
    private function parse(array $ev): ?array
    {
        if (($ev['status'] ?? '') === 'cancelled' || empty($ev['id'])) {
            return null;
        }
        $title = Str::limit(trim($ev['summary'] ?? '') ?: '(no title)', 250, '…');

        if (isset($ev['start']['date'])) { // all-day: Google's end date is exclusive
            $start = $ev['start']['date'];
            $end = Carbon::parse($ev['end']['date'] ?? $start)->subDay()->toDateString();

            return ['title' => $title, 'start_date' => $start, 'end_date' => max($start, $end), 'start_time' => null, 'end_time' => null];
        }
        if (! isset($ev['start']['dateTime'])) {
            return null;
        }

        $start = $ev['start']['dateTime'];
        $end = $ev['end']['dateTime'] ?? $start;
        $startDate = substr($start, 0, 10);
        $endDate = substr($end, 0, 10);
        $endTime = substr($end, 11, 5);
        if ($endDate > $startDate && $endTime === '00:00') { // ends exactly at midnight: belongs to the day before
            $endDate = Carbon::parse($endDate)->subDay()->toDateString();
        }

        return ['title' => $title, 'start_date' => $startDate, 'end_date' => $endDate, 'start_time' => substr($start, 11, 5), 'end_time' => $endTime];
    }

    // --- push -------------------------------------------------------------

    /** @return array{created: int, updated: int, removed: int} */
    private function push(User $user, GoogleConnection $conn): array
    {
        $out = ['created' => 0, 'updated' => 0, 'removed' => 0];

        if (! $conn->mayhem_calendar_id) {
            $cal = $this->google->call($conn, 'POST', '/calendars', [], ['summary' => 'Mayhem', 'description' => 'Quests from your Mayhem dashboard', 'timeZone' => config('app.timezone')]);
            $conn->forceFill(['mayhem_calendar_id' => $cal['id']])->save();
        }
        $calId = rawurlencode($conn->mayhem_calendar_id);

        // What should exist: today..+N days of recurring and dated quests (floating to-dos have no day).
        $desired = [];
        foreach ($this->planner->range($user, now()->startOfDay(), self::PUSH_DAYS) as $day) {
            foreach ($day['items'] as $it) {
                if ($it['overdue'] || ! in_array($it['kind'], ['recurring', 'dated'], true)) {
                    continue;
                }
                $desired["{$it['task_id']}|{$day['date']}"] = [
                    'task_id' => $it['task_id'], 'date' => $day['date'],
                    'title' => ($it['done'] ? '✓ ' : '').$it['title'],
                    'description' => "{$it['tier']}-rank quest · {$it['xp']} XP\nFrom your Mayhem dashboard.",
                ];
            }
        }

        $existing = GooglePushed::where('user_id', $user->id)->whereDate('date', '>=', now()->toDateString())->get()
            ->keyBy(fn ($r) => $r->task_id.'|'.$r->date->toDateString());

        $creates = 0;
        foreach ($desired as $key => $d) {
            $row = $existing->get($key);
            if ($row?->status === 'removed') {
                continue; // you deleted it in Google; stay out of the way
            }
            if (! $row) {
                if ($creates++ >= self::MAX_CREATES) {
                    continue; // the rest follows on the next sync
                }
                $ev = $this->google->call($conn, 'POST', "/calendars/$calId/events", [], [
                    'summary' => $d['title'],
                    'description' => $d['description'],
                    'start' => ['date' => $d['date']],
                    'end' => ['date' => Carbon::parse($d['date'])->addDay()->toDateString()],
                    'transparency' => 'transparent', // quests don't make you "busy"
                    'reminders' => ['useDefault' => false],
                    'extendedProperties' => ['private' => ['mayhem_task_id' => (string) $d['task_id']]],
                ]);
                GooglePushed::create(['user_id' => $user->id, 'task_id' => $d['task_id'], 'date' => $d['date'], 'google_event_id' => $ev['id'], 'title' => $d['title']]);
                $out['created']++;
            } elseif ($row->title !== $d['title']) {
                $this->google->call($conn, 'PATCH', "/calendars/$calId/events/".rawurlencode($row->google_event_id), [], ['summary' => $d['title'], 'description' => $d['description']]);
                $row->update(['title' => $d['title']]);
                $out['updated']++;
            }
        }

        // Quests deleted or rescheduled: take their events off the Mayhem calendar.
        foreach ($existing as $key => $row) {
            // rows past the pushed window (e.g. a quest you moved far ahead in Google) are not ours to clean up
            if (isset($desired[$key]) || $row->status !== 'synced' || $row->date->gt(now()->startOfDay()->addDays(self::PUSH_DAYS - 1))) {
                continue;
            }
            try {
                $this->google->call($conn, 'DELETE', "/calendars/$calId/events/".rawurlencode($row->google_event_id));
            } catch (GoogleException $e) {
                if (! in_array($e->status, [404, 410], true)) {
                    throw $e;
                }
            }
            $row->delete();
            $out['removed']++;
        }

        return $out;
    }
}
