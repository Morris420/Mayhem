<?php

namespace App\Http\Controllers;

use App\Support\Arena\Loadout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ArenaController extends Controller
{
    /** Your fighter: stat multipliers and abilities, computed from your skills. */
    public function loadout(Request $request, Loadout $loadout): JsonResponse
    {
        return response()->json($loadout->for($request->user()));
    }
}
