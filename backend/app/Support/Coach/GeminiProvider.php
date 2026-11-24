<?php

namespace App\Support\Coach;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Google's Gemini API. It has a free tier, which is why it is the default:
 * get a key at https://aistudio.google.com/apikey and put it in backend/.env.
 */
class GeminiProvider implements CoachProvider
{
    private const BASE = 'https://generativelanguage.googleapis.com/v1beta';

    public function label(): string
    {
        return 'Gemini ('.$this->model().')';
    }

    public function configured(): bool
    {
        return filled(config('services.gemini.key'));
    }

    public function json(string $system, array $messages, array $schema): array
    {
        $contents = array_map(fn ($m) => [
            // Gemini only knows 'user' and 'model'
            'role' => $m['role'] === 'user' ? 'user' : 'model',
            'parts' => [['text' => $m['content']]],
        ], $messages);

        try {
            $res = Http::timeout(60)
                ->withHeaders(['x-goog-api-key' => config('services.gemini.key')])
                ->post(self::BASE.'/models/'.$this->model().':generateContent', [
                    'systemInstruction' => ['parts' => [['text' => $system]]],
                    'contents' => $contents,
                    'generationConfig' => [
                        'responseMimeType' => 'application/json',
                        'responseSchema' => self::toGeminiSchema($schema),
                        'temperature' => 0.7,
                        'maxOutputTokens' => 2048,
                    ],
                ]);
        } catch (ConnectionException $e) {
            throw new CoachException('Could not reach Gemini. Check your internet connection.');
        }

        if ($res->status() === 429) {
            throw new CoachException("Gemini's free limit for today is used up. Try again later.", 429);
        }
        if ($res->failed()) {
            $message = $res->json('error.message') ?? 'unknown error';
            if ($res->status() === 400 && str_contains($message, 'API key')) {
                throw new CoachException('Gemini refused the API key. Check GEMINI_API_KEY in backend/.env.');
            }

            throw new CoachException('Gemini could not answer: '.$message);
        }

        $text = $res->json('candidates.0.content.parts.0.text');
        if (! is_string($text) || $text === '') {
            $blocked = $res->json('promptFeedback.blockReason') ?? $res->json('candidates.0.finishReason');

            throw new CoachException('Gemini returned nothing'.($blocked ? " ($blocked)" : '.'));
        }

        $data = json_decode($text, true);
        if (! is_array($data)) {
            throw new CoachException('Gemini sent an answer that was not readable. Try again.');
        }

        return $data;
    }

    private function model(): string
    {
        return config('services.gemini.model') ?: 'gemini-3.1-flash-lite';
    }

    /** Gemini wants OpenAPI-style schemas with upper-case types. */
    private static function toGeminiSchema(array $schema): array
    {
        $out = [];
        foreach ($schema as $key => $value) {
            $out[$key] = match (true) {
                $key === 'type' && is_string($value) => strtoupper($value),
                is_array($value) => self::toGeminiSchema($value),
                default => $value,
            };
        }

        return $out;
    }
}
