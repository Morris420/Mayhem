<?php

namespace App\Providers;

use App\Support\Coach\CoachProvider;
use App\Support\Coach\GeminiProvider;
use App\Support\Coach\OpenAiCompatibleProvider;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Which AI the coach talks to. One line in .env switches it.
        $this->app->bind(CoachProvider::class, fn () => match (config('services.coach.provider')) {
            'openai' => new OpenAiCompatibleProvider,
            default => new GeminiProvider,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
