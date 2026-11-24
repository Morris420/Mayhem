<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // The AI quest coach. See docs/ai-coach-setup.md.
    'coach' => [
        'provider' => env('COACH_PROVIDER', 'gemini'), // gemini | openai
        'daily_messages' => env('COACH_DAILY_MESSAGES', 25),
        'daily_quests' => env('COACH_DAILY_QUESTS', 10),
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-3.1-flash-lite'),
    ],

    // Anything that speaks the OpenAI chat format (OpenRouter, Groq, Ollama, LM Studio, OpenAI).
    'openai_compatible' => [
        'base_url' => env('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1'),
        'key' => env('OPENAI_API_KEY'),
        'model' => env('OPENAI_MODEL'),
    ],

    // Google Calendar sync. See README "Google Calendar" for the setup steps.
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/google/callback'),
        'frontend' => env('FRONTEND_URL', 'http://localhost:5173'),
    ],

];
