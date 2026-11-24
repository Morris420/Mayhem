<?php

namespace App\Support\Google;

class GoogleException extends \RuntimeException
{
    public function __construct(string $message, public readonly bool $needsReconnect = false, public readonly int $status = 0, public readonly string $reason = 'failed')
    {
        parent::__construct($message);
    }
}
