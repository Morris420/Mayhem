<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Arena\ArenaRules;
use App\Support\Arena\Loadout;
use App\Support\SkillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ArenaController extends Controller
{
    /** Your fighter: stats and abilities from the skills you trained. Read-only, always the logged-in user's. */
    public function loadout(Request $request, SkillService $skillService): JsonResponse
    {
        return response()->json($this->loadoutFor($request->user(), $skillService));
    }

    /**
     * You beat a boss. The server checks you were allowed to face it and that the fight was not
     * impossibly short, records the win, and answers with your new loadout (with the ability it unlocked).
     */
    public function defeatBoss(Request $request, string $boss, SkillService $skillService): JsonResponse
    {
        abort_unless(isset(ArenaRules::BOSSES[$boss]), 404);
        $data = $request->validate(['duration_ms' => ['required', 'integer', 'min:0', 'max:3600000']]);
        $user = $request->user();
        [$name, $achievement, $unlocks] = ArenaRules::BOSSES[$boss];

        abort_unless(
            $user->achievements()->where('slug', $achievement)->exists(),
            403,
            "{$name} only appears to hunters with the {$achievement} achievement.",
        );
        if ($data['duration_ms'] < ArenaRules::MIN_BOSS_FIGHT_MS) {
            abort(422, 'That fight was too short to be real.');
        }

        $row = DB::table('arena_boss_defeats')->where(['user_id' => $user->id, 'boss' => $boss])->first();
        $first = $row === null;
        if ($first) {
            DB::table('arena_boss_defeats')->insert([
                'user_id' => $user->id, 'boss' => $boss, 'wins' => 1, 'best_ms' => $data['duration_ms'],
                'first_defeated_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
        } else {
            DB::table('arena_boss_defeats')->where('id', $row->id)->update([
                'wins' => $row->wins + 1, 'best_ms' => min($row->best_ms, $data['duration_ms']), 'updated_at' => now(),
            ]);
        }

        return response()->json([
            'boss' => $boss,
            'first' => $first,
            'unlocked' => $first ? $unlocks : null,
            'loadout' => $this->loadoutFor($user, $skillService),
        ]);
    }

    private function loadoutFor(User $user, SkillService $skillService): array
    {
        $skillService->refresh($user);
        $levels = collect($skillService->overview($user))->pluck('level', 'slug')->all();
        $achievements = $user->achievements()->pluck('slug')->all();
        $defeated = DB::table('arena_boss_defeats')->where('user_id', $user->id)->pluck('boss')->all();

        return Loadout::fromLevels($levels, $achievements, $defeated);
    }
}
