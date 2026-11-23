<?php

namespace App\Http\Controllers;

use App\Models\Achievement;
use App\Support\Progression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AchievementController extends Controller
{
    /** Built-in achievements plus your own custom ones. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            Achievement::visibleTo($request->user())->orderBy('id')->get()
                ->map(fn (Achievement $a) => $this->present($a))
                ->values()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'description' => ['required', 'string', 'max:200'],
            'icon' => ['required', Rule::in(Achievement::ICONS)],
            'tier' => ['required', Rule::in(array_keys(Progression::TIER_XP))],
        ]);

        $achievement = Achievement::create($data + [
            'user_id' => $request->user()->id,
            'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(6)),
        ]);

        return response()->json($this->present($achievement), 201);
    }

    /** You can only delete achievements you created yourself. */
    public function destroy(Request $request, int $achievementId): JsonResponse
    {
        Achievement::where('user_id', $request->user()->id)->findOrFail($achievementId)->delete();

        return response()->json(['message' => 'Achievement deleted']);
    }

    private function present(Achievement $a): array
    {
        return [
            'id' => $a->id,
            'slug' => $a->slug,
            'name' => $a->name,
            'description' => $a->description,
            'icon' => $a->icon,
            'tier' => $a->tier,
            'custom' => $a->isCustom(),
            'auto' => $a->isAuto(),
        ];
    }
}
