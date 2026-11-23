<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'name', 'active'])]
class ChecklistItem extends Model
{
    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function checks(): HasMany
    {
        return $this->hasMany(ChecklistCheck::class);
    }
}
