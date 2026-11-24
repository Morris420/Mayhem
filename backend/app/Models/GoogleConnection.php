<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'access_token', 'refresh_token', 'expires_at', 'mayhem_calendar_id', 'push_enabled', 'last_synced_at'])]
class GoogleConnection extends Model
{
    protected $hidden = ['access_token', 'refresh_token'];

    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'expires_at' => 'datetime',
            'last_synced_at' => 'datetime',
            'push_enabled' => 'boolean',
        ];
    }
}
