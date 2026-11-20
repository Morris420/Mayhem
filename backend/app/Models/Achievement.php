<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'slug', 'name', 'description', 'icon', 'tier'])]
class Achievement extends Model
{
    /** Icons a custom achievement can use (must exist in the frontend AppIcon set). */
    public const ICONS = [
        'trophy', 'medal', 'footprints', 'dumbbell', 'flame', 'sunrise',
        'brain', 'book', 'utensils', 'target', 'sparkles', 'flag', 'zap', 'heart',
    ];

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    /** Built-in achievements plus the ones this user created. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id));
    }

    public function isCustom(): bool
    {
        return $this->user_id !== null;
    }
}
