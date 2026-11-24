<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** The quest "library" shape: what a quest is and how it is scheduled. */
class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $times = (int) ($this->completions_count ?? $this->completions()->count());

        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'tier' => $this->tier,
            'xp' => $this->xp,
            'skill_id' => $this->skill_id,
            'skill' => $this->whenLoaded('skill', fn () => $this->skill ? ['id' => $this->skill->id, 'slug' => $this->skill->slug, 'name' => $this->skill->name, 'icon' => $this->skill->icon] : null),
            'achievement_id' => $this->achievement_id,
            'achievement' => $this->whenLoaded('achievement', fn () => $this->achievement
                ? ['id' => $this->achievement->id, 'name' => $this->achievement->name, 'icon' => $this->achievement->icon]
                : null),
            'schedule' => [
                'mode' => $this->scheduleMode(),
                'days' => $this->recurrence ?? [],
                'date' => $this->scheduled_date?->toDateString(),
                'starts_on' => $this->starts_on?->toDateString(),
            ],
            'times_completed' => $times,
            // For one-off quests "done" simply means "done at least once".
            'completed' => ! $this->isRecurring() && $times > 0,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
