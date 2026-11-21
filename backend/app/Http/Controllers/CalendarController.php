<?php

namespace App\Http\Controllers;

use App\Support\GymPlanner;
use App\Support\QuestPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        foreach ($list as &$day) {
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
