<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A quest. It is either:
 *  - recurring : `recurrence` holds ISO weekdays (1 = Mon ... 7 = Sun), e.g. [1,3,5]
 *  - dated     : `scheduled_date` is a single day
 *  - floating  : neither; a plain to-do that shows up on today's list until you finish it
 */
#[Fillable(['user_id', 'achievement_id', 'skill_id', 'title', 'description', 'tier', 'xp', 'recurrence', 'scheduled_date', 'starts_on'])]
class Task extends Model
{
    use SoftDeletes;

    protected function casts(): array
    {
        return [
            'recurrence' => 'array',
            'scheduled_date' => 'date',
            'starts_on' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function achievement(): BelongsTo
    {
        return $this->belongsTo(Achievement::class);
    }

    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }

    public function completions(): HasMany
    {
        return $this->hasMany(TaskCompletion::class);
    }

    public function isRecurring(): bool
    {
        return ! empty($this->recurrence);
    }

    /** 'weekly' | 'date' | 'none' */
    public function scheduleMode(): string
    {
        return $this->isRecurring() ? 'weekly' : ($this->scheduled_date ? 'date' : 'none');
    }

    /** Does this recurring quest apply on the given day? (Only meaningful for recurring quests.) */
    public function occursOn(CarbonInterface $date): bool
    {
        if (! $this->isRecurring()) {
            return false;
        }

        $start = ($this->starts_on ?? $this->created_at)->copy()->startOfDay();

        return $date->copy()->startOfDay()->gte($start)
            && in_array($date->isoWeekday(), $this->recurrence, true);
    }
}
