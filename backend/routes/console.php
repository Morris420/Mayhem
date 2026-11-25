<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Give a hunter an achievement by hand (testing, or a record from before the app):
//   php artisan mayhem:grant-achievement JohnDoe golden-medal
Artisan::command('mayhem:grant-achievement {username} {slug}', function (string $username, string $slug) {
    $user = \App\Models\User::where('username', $username)->first();
    $achievement = \App\Models\Achievement::where('slug', $slug)->whereNull('user_id')->first();
    if (! $user || ! $achievement) {
        $this->error(! $user ? "No user called {$username}." : "No built-in achievement {$slug}.");

        return 1;
    }
    $user->achievements()->syncWithoutDetaching([$achievement->id => ['unlocked_at' => now()]]);
    $this->info("{$username} now has '{$achievement->name}'.");

    return 0;
})->purpose('Grant a built-in achievement to a user');
