<?php

namespace App\Http\Controllers;

use App\Models\ChecklistCheck;
use App\Models\ChecklistItem;
use App\Models\Food;
use App\Models\MealEntry;
use App\Support\AchievementEngine;
use App\Support\DietRules;
use App\Support\FoodSearch;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class NutritionController extends Controller
{
    private const DEFAULT_CHECKLIST = ['Vitamins', 'Fruit', 'Vegetables'];

    private const MAX_CHECKLIST = 12;

    private ?array $unlocked = null;

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->payload($request, $this->date($request->query('date'))));
    }

    public function goals(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kcal' => ['required', 'integer', 'between:800,10000'],
            'protein' => ['required', 'integer', 'between:10,600'],
        ]);
        $request->user()->forceFill(['kcal_goal' => $data['kcal'], 'protein_goal' => $data['protein']])->save();

        return response()->json($this->payload($request, $this->date($request->input('date'))));
    }

    public function search(Request $request, FoodSearch $search): JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'min:2', 'max:80']]);

        try {
            return response()->json(['results' => $search->search($data['q'])]);
        } catch (\RuntimeException) {
            return response()->json(['message' => 'The food database could not be reached. You can still add a food by hand.'], 502);
        }
    }

    public function store(Request $request, AchievementEngine $engine): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
            'grams' => ['required', 'numeric', 'min:1', 'max:5000'],
            'food_id' => ['nullable', 'integer'],
            'food' => ['required_without:food_id', 'array'],
            'food.name' => ['required_with:food', 'string', 'max:160'],
            'food.brand' => ['nullable', 'string', 'max:120'],
            'food.code' => ['nullable', 'string', 'max:40'],
            'food.kcal_100g' => ['required_with:food', 'numeric', 'between:0,900'],
            'food.protein_100g' => ['required_with:food', 'numeric', 'between:0,100'],
            'food.serving_g' => ['nullable', 'numeric', 'between:1,2000'],
        ]);

        $food = isset($data['food_id'])
            ? $user->foods()->findOrFail($data['food_id'])
            : $this->saveFood($request, $data['food']);

        $user->mealEntries()->create([
            'food_id' => $food->id,
            'date' => $data['date'] ?? now()->toDateString(),
            'name' => $food->brand ? "{$food->name} ({$food->brand})" : $food->name,
            'grams' => $data['grams'],
            'kcal_100g' => $food->kcal_100g,
            'protein_100g' => $food->protein_100g,
            ...$this->macros($food->kcal_100g, $food->protein_100g, (float) $data['grams']),
        ]);

        $this->unlocked = $engine->evaluate($user);

        return response()->json($this->payload($request, $this->date($data['date'] ?? null)), 201);
    }

    public function update(Request $request, AchievementEngine $engine, int $entryId): JsonResponse
    {
        $entry = $request->user()->mealEntries()->findOrFail($entryId);
        $data = $request->validate(['grams' => ['required', 'numeric', 'min:1', 'max:5000']]);

        $entry->update(['grams' => $data['grams']] + $this->macros($entry->kcal_100g, $entry->protein_100g, (float) $data['grams']));

        $this->unlocked = $engine->evaluate($request->user());

        return response()->json($this->payload($request, $entry->date));
    }

    // --- daily checklist (vitamins, fruit, ...) -----------------------------

    public function addChecklist(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['name' => ['required', 'string', 'max:60'], 'date' => ['nullable', 'date_format:Y-m-d']]);
        $this->checklistItems($user);

        if ($user->checklistItems()->where('active', true)->count() >= self::MAX_CHECKLIST) {
            return response()->json(['message' => 'Your checklist is full ('.self::MAX_CHECKLIST.' items). Remove one first.'], 422);
        }
        $name = trim($data['name']);
        $existing = $user->checklistItems()->where('name', $name)->first();
        $existing ? $existing->update(['active' => true]) : $user->checklistItems()->create(['name' => $name]);

        return response()->json($this->payload($request, $this->date($data['date'] ?? null)), 201);
    }

    /** Tick or untick an item for a day. */
    public function check(Request $request, int $itemId): JsonResponse
    {
        $user = $request->user();
        $item = $user->checklistItems()->findOrFail($itemId);
        $data = $request->validate(['done' => ['required', 'boolean'], 'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today']]);
        $date = $data['date'] ?? now()->toDateString();

        if ($data['done']) {
            ChecklistCheck::firstOrCreate(['checklist_item_id' => $item->id, 'date' => $date], ['user_id' => $user->id]);
        } else {
            ChecklistCheck::where('checklist_item_id', $item->id)->whereDate('date', $date)->delete();
        }

        return response()->json($this->payload($request, $this->date($date)));
    }

    /** Hides the item from your list; days you already ticked it stay on record. */
    public function removeChecklist(Request $request, int $itemId): JsonResponse
    {
        $request->user()->checklistItems()->findOrFail($itemId)->update(['active' => false]);

        return response()->json($this->payload($request, $this->date($request->query('date'))));
    }

    public function destroy(Request $request, int $entryId): JsonResponse
    {
        $entry = $request->user()->mealEntries()->findOrFail($entryId);
        $date = $entry->date;
        $entry->delete();

        return response()->json($this->payload($request, $date));
    }

    // ---------------------------------------------------------------------

    private function date(?string $value): CarbonInterface
    {
        $d = $value ? now()->parse($value)->startOfDay() : now()->startOfDay();

        return $d->isFuture() ? now()->startOfDay() : $d;
    }

    private function macros(float $kcal100, float $protein100, float $grams): array
    {
        return ['kcal' => round($kcal100 * $grams / 100, 2), 'protein' => round($protein100 * $grams / 100, 2)];
    }

    /** Foods coming from Open Food Facts are keyed by barcode; hand-typed ones by name. */
    private function saveFood(Request $request, array $f): Food
    {
        $values = [
            'name' => $f['name'], 'brand' => $f['brand'] ?? null,
            'kcal_100g' => $f['kcal_100g'], 'protein_100g' => $f['protein_100g'],
            'serving_g' => $f['serving_g'] ?? null,
        ];
        $user = $request->user();

        return ! empty($f['code'])
            ? $user->foods()->updateOrCreate(['code' => $f['code']], $values + ['source' => 'off'])
            : $user->foods()->updateOrCreate(['code' => null, 'name' => $f['name'], 'source' => 'manual'], $values);
    }

    /** Active checklist items. First visit seeds the defaults. */
    private function checklistItems($user)
    {
        if (! $user->checklistItems()->exists()) {
            foreach (self::DEFAULT_CHECKLIST as $name) {
                $user->checklistItems()->create(['name' => $name]);
            }
        }

        return $user->checklistItems()->where('active', true)->orderBy('id')->get();
    }

    private function payload(Request $request, CarbonInterface $date): array
    {
        $user = $request->user();
        $kcalGoal = (int) $user->kcal_goal;
        $proteinGoal = (int) $user->protein_goal;

        $recent = $user->mealEntries()->where('date', '>=', $date->copy()->subDays(89)->toDateString())->get();
        $perDay = $recent->groupBy(fn ($e) => $e->date->toDateString())
            ->map(fn (Collection $c) => ['kcal' => $c->sum('kcal'), 'protein' => $c->sum('protein')]);

        $entries = $user->mealEntries()->whereDate('date', $date->toDateString())->orderBy('id')->get();
        $totals = ['kcal' => round($entries->sum('kcal')), 'protein' => round($entries->sum('protein'), 1)];

        $week = collect(range(6, 0))->map(function ($ago) use ($date, $perDay, $kcalGoal, $proteinGoal) {
            $d = $date->copy()->subDays($ago)->toDateString();
            $t = $perDay->get($d, ['kcal' => 0, 'protein' => 0]);

            return ['date' => $d, 'kcal' => (int) round($t['kcal']), 'protein' => (int) round($t['protein']), 'logged' => $perDay->has($d)]
                + ['day_ok' => $perDay->has($d) && DietRules::status($t['kcal'], $t['protein'], $kcalGoal, $proteinGoal)['day_ok']];
        })->values();

        // Streak of consecutive days where both goals were hit (today may still be in progress).
        $cursor = now()->startOfDay();
        $ok = fn ($d) => $perDay->has($d) && DietRules::status($perDay[$d]['kcal'], $perDay[$d]['protein'], $kcalGoal, $proteinGoal)['day_ok'];
        if (! $ok($cursor->toDateString())) {
            $cursor->subDay();
        }
        $streak = 0;
        while ($streak < 90 && $ok($cursor->toDateString())) {
            $streak++;
            $cursor->subDay();
        }

        // Foods you eat most recently, ready to click again.
        $recentIds = $user->mealEntries()->whereNotNull('food_id')->orderByDesc('id')->limit(60)->pluck('food_id')->unique()->take(12);
        $foods = $user->foods()->whereIn('id', $recentIds)->get()->sortBy(fn ($f) => $recentIds->search($f->id))->values();

        $items = $this->checklistItems($user);
        $doneIds = ChecklistCheck::where('user_id', $user->id)->whereDate('date', $date->toDateString())->pluck('checklist_item_id');
        $checklist = $items->map(fn (ChecklistItem $i) => ['id' => $i->id, 'name' => $i->name, 'done' => $doneIds->contains($i->id)])->values();

        return [
            'unlocked' => $this->unlocked ?? [],
            'checklist' => $checklist,
            'extras' => ['done' => $checklist->where('done', true)->count(), 'total' => $checklist->count()],
            'date' => $date->toDateString(),
            'is_today' => $date->isSameDay(now()),
            'goals' => ['kcal' => $kcalGoal, 'protein' => $proteinGoal],
            'entries' => $entries->map(fn (MealEntry $e) => [
                'id' => $e->id, 'name' => $e->name, 'grams' => $e->grams, 'kcal' => (int) round($e->kcal), 'protein' => round($e->protein, 1),
            ])->values(),
            'totals' => $totals,
            'status' => DietRules::status($totals['kcal'], $totals['protein'], $kcalGoal, $proteinGoal),
            'week' => $week,
            'streak' => $streak,
            'recent_foods' => $foods->map(fn (Food $f) => [
                'id' => $f->id, 'name' => $f->name, 'brand' => $f->brand, 'kcal_100g' => $f->kcal_100g,
                'protein_100g' => $f->protein_100g, 'serving_g' => $f->serving_g,
            ])->values(),
        ];
    }
}
