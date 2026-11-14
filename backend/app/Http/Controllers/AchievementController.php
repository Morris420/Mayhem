<?php

namespace App\Http\Controllers;

use App\Models\Achievement;
use Illuminate\Http\JsonResponse;

class AchievementController extends Controller
{
    /** The catalog the task builder lets you pick from. */
    public function index(): JsonResponse
    {
        return response()->json(
            Achievement::orderBy('id')->get(['id', 'slug', 'name', 'description', 'icon', 'tier'])
        );
    }
}
