<?php

namespace App\Support\Google;

class GoogleException extends \RuntimeException
{
    public function __construct(string $message, public readonly bool $needsReconnect = false, public readonly int $status = 0)
    {
        parent::__construct($message);
    }
}
