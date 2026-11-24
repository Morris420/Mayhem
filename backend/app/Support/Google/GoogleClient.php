<?php

namespace App\Support\Google;

use App\Models\GoogleConnection;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** The OAuth dance and authenticated calls to the Google Calendar API. */
class GoogleClient
{
    private const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const API = 'https://www.googleapis.com/calendar/v3';

    private const SCOPE = 'https://www.googleapis.com/auth/calendar';

    public function configured(): bool
    {
        return filled(config('services.google.client_id')) && filled(config('services.google.client_secret'));
    }

    /** The Google consent-screen address. `state` ties the callback to your account. */
    public function authUrl(User $user, ?string $state = null): string
    {
        $state ??= Str::random(40);
        Cache::put("google-oauth:$state", $user->id, now()->addMinutes(10));

        return self::AUTH_URL.'?'.http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => self::SCOPE,
            'access_type' => 'offline',   // gives us a refresh token
            'prompt' => 'consent',        // ...every time, so reconnecting always works
            'include_granted_scopes' => 'true',
            'state' => $state,
        ]);
    }

    /** Called from the redirect Google sends you back to. */
    public function connect(string $code, string $state, ?string $browserState = null): User
    {
        // The sign-in must finish in the same browser that started it, otherwise someone could
        // send you their own link and get your calendar attached to their account.
        if (! $browserState || ! hash_equals($state, $browserState)) {
            throw new GoogleException('This sign-in was not started in this browser. Start the connection again.', false, 0, 'mismatch');
        }

        $userId = Cache::pull("google-oauth:$state");
        $user = $userId ? User::find($userId) : null;
        if (! $user) {
            throw new GoogleException('This sign-in link expired. Start the connection again.', false, 0, 'expired');
        }

        $res = $this->http()->asForm()->post(self::TOKEN_URL, [
            'code' => $code,
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => config('services.google.redirect'),
            'grant_type' => 'authorization_code',
        ]);
        if ($res->failed() || ! $res->json('access_token')) {
            throw new GoogleException('Google refused the sign-in: '.($res->json('error_description') ?? $res->json('error') ?? 'unknown error'));
        }

        $existing = $user->googleConnection;
        $user->googleConnection()->updateOrCreate([], [
            'access_token' => $res->json('access_token'),
            'refresh_token' => $res->json('refresh_token') ?? $existing?->refresh_token,
            'expires_at' => now()->addSeconds((int) $res->json('expires_in', 3600)),
        ]);

        return $user;
    }

    public function revoke(GoogleConnection $conn): void
    {
        try {
            $this->http()->asForm()->post('https://oauth2.googleapis.com/revoke', ['token' => $conn->refresh_token ?? $conn->access_token]);
        } catch (\Throwable) {
            // best effort: the local tokens are deleted either way
        }
    }

    /** @return array<string, mixed> decoded JSON ([] for empty responses) */
    public function call(GoogleConnection $conn, string $method, string $path, array $query = [], ?array $json = null): array
    {
        $this->freshToken($conn);

        $send = fn () => $this->http()->withToken($conn->access_token)->send(
            $method,
            self::API.$path.($query ? '?'.http_build_query($query) : ''),
            $json === null ? [] : ['json' => $json],
        );

        try {
            $res = $send();
            if ($res->status() === 401) { // token revoked/expired early: refresh once and retry
                $this->refresh($conn);
                $res = $send();
            }
        } catch (ConnectionException) {
            throw new GoogleException('Could not reach Google. Check your internet connection and try again.');
        }

        if ($res->status() === 401) {
            throw new GoogleException('Google access ran out. Reconnect Google Calendar.', true);
        }
        if ($res->failed()) {
            throw new GoogleException($res->json('error.message') ?? "Google answered with status {$res->status()}.", false, $res->status());
        }

        return $res->json() ?? [];
    }

    private function freshToken(GoogleConnection $conn): void
    {
        if ($conn->expires_at === null || $conn->expires_at->lt(now()->addMinute())) {
            $this->refresh($conn);
        }
    }

    private function refresh(GoogleConnection $conn): void
    {
        if (! $conn->refresh_token) {
            throw new GoogleException('Google access ran out. Reconnect Google Calendar.', true);
        }
        try {
            $res = $this->http()->asForm()->post(self::TOKEN_URL, [
                'client_id' => config('services.google.client_id'),
                'client_secret' => config('services.google.client_secret'),
                'refresh_token' => $conn->refresh_token,
                'grant_type' => 'refresh_token',
            ]);
        } catch (ConnectionException) {
            throw new GoogleException('Could not reach Google. Check your internet connection and try again.');
        }

        if ($res->failed() || ! $res->json('access_token')) {
            throw new GoogleException('Google access ran out. Reconnect Google Calendar.', true);
        }
        $conn->forceFill(['access_token' => $res->json('access_token'), 'expires_at' => now()->addSeconds((int) $res->json('expires_in', 3600))])->save();
    }

    private function http(): PendingRequest
    {
        return Http::timeout(20)->acceptJson();
    }
}
