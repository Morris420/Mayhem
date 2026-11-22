<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'code', 'name', 'brand', 'source', 'kcal_100g', 'protein_100g', 'serving_g'])]
class Food extends Model
{
    protected $table = 'foods';

    protected function casts(): array
    {
        return ['kcal_100g' => 'float', 'protein_100g' => 'float', 'serving_g' => 'float'];
    }

    public function entries(): HasMany
    {
        return $this->hasMany(MealEntry::class);
    }
}
