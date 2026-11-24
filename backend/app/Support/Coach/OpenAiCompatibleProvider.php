<?php

namespace App\Support\Coach;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Anything that speaks the OpenAI chat format: OpenRouter, Groq, Together,
 * a local Ollama or LM Studio, or OpenAI itself. Set COACH_PROVIDER=openai
 * plus the base address, key and model in backend/.env.
 */
class OpenAiCompatibleProvider implements CoachProvider
{
    public function label(): string
    {
        return config('services.openai_compatible.model') ?: 'OpenAI-compatible';
    }

    public function configured(): bool
    {
        return filled(config('services.openai_compatible.base_url')) && filled(config('services.openai_compatible.model'));
    }

    public function json(string $system, array $messages, array $schema): array
    {
        // Not every server supports a schema, so the shape is also spelled out in the prompt.
        $system .= "\n\nAnswer with JSON only, shaped exactly like this schema:\n".json_encode($schema);

        $payload = [['role' => 'system', 'content' => $system]];
        foreach ($messages as $m) {
            $payload[] = ['role' => $m['role'] === 'user' ? 'user' : 'assistant', 'content' => $m['content']];
        }

        try {
            $res = Http::timeout(60)
                ->withToken((string) config('services.openai_compatible.key'))
                ->post(rtrim(config('services.openai_compatible.base_url'), '/').'/chat/completions', [
                    'model' => config('services.openai_compatible.model'),
                    'messages' => $payload,
                    'response_format' => ['type' => 'json_object'],
                    'temperature' => 0.7,
                ]);
        } catch (ConnectionException $e) {
            throw new CoachException('Could not reach the AI server. Is it running?');
        }

        if ($res->status() === 429) {
            throw new CoachException('The AI server is rate limiting us. Try again in a minute.', 429);
        }
        if ($res->failed()) {
            throw new CoachException('The AI server could not answer: '.($res->json('error.message') ?? 'unknown error'));
        }

        $text = (string) $res->json('choices.0.message.content');
        // Some models wrap JSON in a ```json fence.
        $text = trim(preg_replace('/^```(?:json)?|```$/m', '', $text));
        $data = json_decode($text, true);

        if (! is_array($data)) {
            throw new CoachException('The AI sent an answer that was not readable. Try again.');
        }

        return $data;
    }
}
