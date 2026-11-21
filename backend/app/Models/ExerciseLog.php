<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'exercise_id', 'date', 'weight', 'sets', 'reps'])]
class ExerciseLog extends Model
{
    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'weight' => 'float'];
    }

    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class)->withTrashed();
    }
}
