<?php

namespace App\Http\Resources;

use App\Support\Progression;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'guild' => $this->guild,
            'joined_at' => $this->created_at->toIso8601String(),
            ...Progression::summary($this->xp),
        ];
    }
}
