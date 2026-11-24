<?php

namespace App\Http\Controllers;

use App\Models\GoogleEvent;
use App\Support\DietRules;
use App\Support\GymPlanner;
use App\Support\QuestPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class CalendarController extends Controller
{
    /** GET /api/calendar?start=2026-11-16&days=7  (defaults: this week, Monday first) */
    public function show(Request $request, QuestPlanner $planner, GymPlanner $gym): JsonResponse
    {
        $data = $request->validate([
            'start' => ['nullable', 'date_format:Y-m-d'],
            'days' => ['nullable', 'integer', 'between:1,42'],
        ]);

        $start = isset($data['start'])
            ? now()->parse($data['start'])->startOfDay()
            : now()->startOfWeek()->startOfDay();
        $days = (int) ($data['days'] ?? 7);

        $list = $planner->range($request->user(), $start, $days);
        $workouts = $gym->days($request->user(), $start, $days);
        $user = $request->user();
        $end = $start->copy()->addDays($days - 1);
        $diet = DietRules::perDay($user);
        $unlockedByDay = $user->achievements()->get()
            ->filter(fn ($a) => $a->pivot->unlocked_at)
            ->groupBy(fn ($a) => Carbon::parse($a->pivot->unlocked_at)->timezone(config('app.timezone'))->toDateString())
            ->map->count();

        $events = GoogleEvent::where('user_id', $user->id)
            ->whereDate('start_date', '<=', $end->toDateString())->whereDate('end_date', '>=', $start->toDateString())
            ->orderByRaw('start_time is null desc')->orderBy('start_time')->get();

        foreach ($list as &$day) {
            $day['events'] = $events->filter(fn ($e) => $e->start_date->toDateString() <= $day['date'] && $e->end_date->toDateString() >= $day['date'])
                ->map->present()->values()->all();
            $t = $diet->get($day['date']);
            $day['diet'] = $t ? ['logged' => true, 'kcal' => (int) round($t['kcal']), 'protein' => (int) round($t['protein']), 'ok' => $t['ok']] : null;
            $day['achievements'] = (int) $unlockedByDay->get($day['date'], 0);
            $w = $workouts[$day['date']];
            $day['workout'] = $w['exercises'] ? ['body_parts' => $w['body_parts'], 'exercises' => $w['exercises'], 'trained' => $w['trained']] : null;
        }
        unset($day);

        return response()->json([
            'start' => $start->toDateString(),
            'end' => $start->copy()->addDays($days - 1)->toDateString(),
            'days' => $list,
            'summary' => [
                'planned' => collect($list)->sum('total'),
                'done' => collect($list)->sum('done'),
                'xp_planned' => collect($list)->sum('xp_planned'),
                'xp_done' => collect($list)->sum('xp_done'),
            ],
        ]);
    }
}
