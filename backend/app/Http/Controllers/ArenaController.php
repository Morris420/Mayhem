<?php

namespace App\Http\Controllers;

use App\Support\Arena\Loadout;
use App\Support\SkillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ArenaController extends Controller
{
    /** Your fighter: stats and abilities from the skills you trained. Read-only, always the logged-in user's. */
    public function loadout(Request $request, SkillService $skillService): JsonResponse
    {
        $user = $request->user();
        $skillService->refresh($user);
        $levels = collect($skillService->overview($user))->pluck('level', 'slug')->all();

        return response()->json(Loadout::fromLevels($levels));
    }
}
