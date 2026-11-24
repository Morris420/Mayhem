<?php

use App\Http\Controllers\AchievementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DayController;
use App\Http\Controllers\GoogleController;
use App\Http\Controllers\GymController;
use App\Http\Controllers\NutritionController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

// --- Public -----------------------------------------------------------------
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
// Google redirects the browser here (no session); the one-time `state` token proves who started it.
Route::get('/google/callback', [GoogleController::class, 'callback']);

// --- Authenticated (Sanctum SPA session) -------------------------------------
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);

    Route::get('/dashboard', [DashboardController::class, 'show']);
    Route::get('/calendar', [CalendarController::class, 'show']);

    Route::get('/tasks', [TaskController::class, 'index']);
    Route::post('/tasks', [TaskController::class, 'store']);
    Route::put('/tasks/{task}', [TaskController::class, 'update']);
    Route::put('/tasks/{task}/schedule', [TaskController::class, 'schedule']);
    Route::post('/tasks/{task}/complete', [TaskController::class, 'complete']);
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy']);

    Route::get('/gym', [GymController::class, 'index']);
    Route::post('/gym/starter', [GymController::class, 'starter']);
    Route::post('/gym/exercises', [GymController::class, 'store']);
    Route::put('/gym/exercises/{exercise}', [GymController::class, 'update']);
    Route::delete('/gym/exercises/{exercise}', [GymController::class, 'destroy']);
    Route::post('/gym/exercises/{exercise}/logs', [GymController::class, 'log']);
    Route::delete('/gym/logs/{log}', [GymController::class, 'destroyLog']);

    Route::get('/nutrition', [NutritionController::class, 'index']);
    Route::put('/nutrition/goals', [NutritionController::class, 'goals']);
    Route::get('/nutrition/search', [NutritionController::class, 'search'])->middleware('throttle:30,1');
    Route::post('/nutrition/entries', [NutritionController::class, 'store']);
    Route::put('/nutrition/entries/{entry}', [NutritionController::class, 'update']);
    Route::delete('/nutrition/entries/{entry}', [NutritionController::class, 'destroy']);
    Route::post('/nutrition/checklist', [NutritionController::class, 'addChecklist']);
    Route::put('/nutrition/checklist/{item}', [NutritionController::class, 'check']);
    Route::delete('/nutrition/checklist/{item}', [NutritionController::class, 'removeChecklist']);

    Route::get('/google', [GoogleController::class, 'status']);
    Route::get('/google/connect', [GoogleController::class, 'connect']);
    Route::post('/google/sync', [GoogleController::class, 'sync'])->middleware('throttle:12,1');
    Route::put('/google/settings', [GoogleController::class, 'settings']);
    Route::delete('/google', [GoogleController::class, 'disconnect']);

    Route::get('/days/{date}', [DayController::class, 'show']);

    Route::get('/achievements', [AchievementController::class, 'index']);
    Route::post('/achievements', [AchievementController::class, 'store']);
    Route::delete('/achievements/{achievement}', [AchievementController::class, 'destroy']);
});
