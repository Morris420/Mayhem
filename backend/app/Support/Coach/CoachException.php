<?php

namespace App\Support\Coach;

/** Something went wrong talking to the AI provider. The message is safe to show. */
class CoachException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 502)
    {
        parent::__construct($message);
    }
}
