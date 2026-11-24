<?php

namespace App\Http\Controllers;

use App\Models\GoogleEvent;
use App\Models\GooglePushed;
use App\Support\Google\GoogleCalendarSync;
use App\Support\Google\GoogleClient;
use App\Support\Google\GoogleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class GoogleController extends Controller
{
    public function status(Request $request, GoogleClient $google): JsonResponse
    {
        return response()->json($this->payload($request, $google));
    }

    /** Returns the Google sign-in address; the frontend sends the browser there. */
    public function connect(Request $request, GoogleClient $google): JsonResponse
    {
        if (! $google->configured()) {
            return response()->json(['message' => 'Google is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env first.'], 422);
        }

        return response()->json(['url' => $google->authUrl($request->user())]);
    }

    /** Google sends the browser back here. There is no session on this request, the `state` identifies you. */
    public function callback(Request $request, GoogleClient $google): RedirectResponse
    {
        $back = rtrim(config('services.google.frontend'), '/').'/calendar';

        if ($request->query('error') || ! $request->query('code') || ! $request->query('state')) {
            return redirect($back.'?google=denied');
        }

        try {
            $google->connect($request->query('code'), $request->query('state'));
        } catch (GoogleException $e) {
            return redirect($back.'?'.http_build_query(['google' => 'error', 'reason' => $e->getMessage()]));
        }

        return redirect($back.'?google=connected');
    }

    public function sync(Request $request, GoogleClient $google, GoogleCalendarSync $sync): JsonResponse
    {
        $user = $request->user();
        if (! $user->googleConnection) {
            return response()->json(['message' => 'Google Calendar is not connected.'], 422);
        }

        try {
            $result = $sync->run($user);
        } catch (GoogleException $e) {
            if ($e->needsReconnect) {
                $user->googleConnection->forceFill(['access_token' => '', 'refresh_token' => null, 'expires_at' => null])->save();
            }

            return response()->json(['message' => $e->getMessage(), 'reconnect' => $e->needsReconnect] + $this->payload($request, $google), 502);
        }

        return response()->json(['result' => $result] + $this->payload($request->setUserResolver(fn () => $user->refresh()), $google));
    }

    public function settings(Request $request, GoogleClient $google): JsonResponse
    {
        $data = $request->validate(['push_enabled' => ['required', 'boolean']]);
        $conn = $request->user()->googleConnection;
        abort_unless($conn, 422, 'Google Calendar is not connected.');
        $conn->update(['push_enabled' => $data['push_enabled']]);

        return response()->json($this->payload($request, $google));
    }

    /** Disconnect. Events already in your Google calendars stay there. */
    public function disconnect(Request $request, GoogleClient $google): JsonResponse
    {
        $user = $request->user();
        if ($conn = $user->googleConnection) {
            $google->revoke($conn);
            $conn->delete();
        }
        GoogleEvent::where('user_id', $user->id)->delete();
        GooglePushed::where('user_id', $user->id)->delete();

        return response()->json($this->payload($request->setUserResolver(fn () => $user->unsetRelation('googleConnection')), $google));
    }

    private function payload(Request $request, GoogleClient $google): array
    {
        $conn = $request->user()->googleConnection()->first();
        $connected = $conn && $conn->access_token !== '' && $conn->access_token !== null;

        return [
            'configured' => $google->configured(),
            'connected' => (bool) $connected,
            'needs_reconnect' => $conn && ! $connected,
            'push_enabled' => $connected ? $conn->push_enabled : true,
            'last_synced_at' => $connected ? $conn->last_synced_at?->toIso8601String() : null,
            'redirect_uri' => config('services.google.redirect'),
        ];
    }
}
