<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['user_id', 'name', 'body_part', 'weekdays', 'goal_weight', 'goal_date'])]
class Exercise extends Model
{
    use SoftDeletes;

    public const BODY_PARTS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio'];

    protected function casts(): array
    {
        return [
            'weekdays' => 'array',
            'goal_weight' => 'float',
            'goal_date' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(ExerciseLog::class);
    }

    public function occursOnWeekday(int $isoWeekday): bool
    {
        return in_array($isoWeekday, $this->weekdays ?? [], true);
    }
}
