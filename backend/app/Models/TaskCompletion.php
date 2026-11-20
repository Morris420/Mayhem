<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One row = "this quest was done on this day" (and what it was worth). */
#[Fillable(['user_id', 'task_id', 'date', 'xp', 'completed_at'])]
class TaskCompletion extends Model
{
    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'completed_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class)->withTrashed();
    }
}
