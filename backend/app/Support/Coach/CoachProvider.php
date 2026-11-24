<?php

namespace App\Support\Coach;

/**
 * One AI provider. Swapping providers is a line in .env: everything above this
 * interface (the prompt, the context, the quest rules) stays the same.
 */
interface CoachProvider
{
    /** Shown in the UI, e.g. "Gemini (gemini-3.1-flash-lite)". */
    public function label(): string;

    /** Is there an API key / address to talk to? */
    public function configured(): bool;

    /**
     * Ask for one JSON answer shaped like $schema.
     *
     * @param  array<int, array{role: string, content: string}>  $messages  oldest first, roles 'user' | 'coach'
     * @return array the decoded JSON
     */
    public function json(string $system, array $messages, array $schema): array;
}
