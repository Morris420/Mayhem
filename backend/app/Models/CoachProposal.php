<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A quest the coach suggested. It only becomes a real quest when you accept it. */
#[Fillable(['user_id', 'coach_message_id', 'skill_id', 'task_id', 'title', 'description', 'tier', 'reason', 'schedule', 'status'])]
class CoachProposal extends Model
{
    protected function casts(): array
    {
        return ['schedule' => 'array'];
    }

    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }

    public function present(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'tier' => $this->tier,
            'reason' => $this->reason,
            'schedule' => $this->schedule ?? ['mode' => 'none'],
            'skill' => $this->skill ? ['id' => $this->skill->id, 'slug' => $this->skill->slug, 'name' => $this->skill->name] : null,
            'status' => $this->status,
            'task_id' => $this->task_id,
        ];
    }
}
