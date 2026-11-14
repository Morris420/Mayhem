<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Controls exactly which task fields the API exposes to the frontend. */
class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'tier' => $this->tier,
            'xp' => $this->xp,
            'completed' => $this->completed_at !== null,
            'completed_at' => $this->completed_at?->toIso8601String(),
            'achievement' => $this->whenLoaded('achievement', fn () => $this->achievement
                ? ['id' => $this->achievement->id, 'name' => $this->achievement->name, 'icon' => $this->achievement->icon]
                : null),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
