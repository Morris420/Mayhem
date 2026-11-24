<?php

namespace App\Http\Controllers;

use App\Models\ChecklistCheck;
use App\Models\ExerciseLog;
use App\Models\GoogleEvent;
use App\Models\MealEntry;
use App\Support\DietRules;
use App\Support\QuestPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DayController extends Controller
{
    /** GET /api/days/2026-11-20 - everything that happened (or was planned) on one day. */
    public function show(Request $request, QuestPlanner $planner, string $date): JsonResponse
    {
        abort_unless(preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) && checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4)), 404);

        $user = $request->user();
        $day = now()->parse($date)->startOfDay();

        $quests = $planner->range($user, $day, 1)[0];

        $logs = ExerciseLog::where('user_id', $user->id)->whereDate('date', $date)->with('exercise')->orderBy('id')->get();
        $planned = $user->exercises()->get()->filter(fn ($e) => $e->occursOnWeekday($day->isoWeekday()));

        $entries = MealEntry::where('user_id', $user->id)->whereDate('date', $date)->orderBy('id')->get();
        $kcal = (float) $entries->sum('kcal');
        $protein = (float) $entries->sum('protein');
        $goals = ['kcal' => (int) $user->kcal_goal, 'protein' => (int) $user->protein_goal];

        $checks = ChecklistCheck::where('user_id', $user->id)->whereDate('date', $date)->with('item')->get()
            ->map(fn ($c) => $c->item?->name)->filter()->values();

        $unlocked = $user->achievements()->get()
            ->filter(fn ($a) => $a->pivot->unlocked_at && Carbon::parse($a->pivot->unlocked_at)->timezone(config('app.timezone'))->toDateString() === $date)
            ->map(fn ($a) => ['id' => $a->id, 'name' => $a->name, 'description' => $a->description, 'icon' => $a->icon, 'tier' => $a->tier])
            ->values();

        return response()->json([
            'date' => $date,
            'is_today' => $day->isSameDay(now()),
            'is_future' => $day->isFuture(),
            'quests' => $quests,
            'gym' => [
                'planned' => $planned->map(fn ($e) => ['name' => $e->name, 'body_part' => $e->body_part])->values(),
                'trained' => $logs->isNotEmpty(),
                'logs' => $logs->map(fn ($l) => [
                    'name' => $l->exercise?->name, 'body_part' => $l->exercise?->body_part,
                    'weight' => $l->weight, 'sets' => $l->sets, 'reps' => $l->reps,
                ])->values(),
            ],
            'diet' => [
                'logged' => $entries->isNotEmpty(),
                'goals' => $goals,
                'totals' => ['kcal' => (int) round($kcal), 'protein' => (int) round($protein)],
                'status' => DietRules::status($kcal, $protein, $goals['kcal'], $goals['protein']),
                'checked' => $checks,
                'foods' => $entries->map(fn ($e) => ['name' => $e->name, 'grams' => $e->grams, 'kcal' => (int) round($e->kcal)])->values(),
            ],
            'achievements' => $unlocked,
            'events' => GoogleEvent::where('user_id', $user->id)->whereDate('start_date', '<=', $date)->whereDate('end_date', '>=', $date)
                ->orderByRaw('start_time is null desc')->orderBy('start_time')->get()->map->present()->values(),
            'google_connected' => $user->googleConnection()->exists(),
        ]);
    }
}
