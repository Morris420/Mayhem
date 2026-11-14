<?php

use Illuminate\Support\Facades\Route;

// This backend is API-only; the Vue app lives in /frontend.
Route::get('/', fn () => response()->json(['app' => 'Mayhem API', 'status' => 'online']));
