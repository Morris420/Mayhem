<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'food_id', 'date', 'name', 'grams', 'kcal_100g', 'protein_100g', 'kcal', 'protein'])]
class MealEntry extends Model
{
    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'grams' => 'float', 'kcal_100g' => 'float', 'protein_100g' => 'float',
            'kcal' => 'float', 'protein' => 'float',
        ];
    }

    public function food(): BelongsTo
    {
        return $this->belongsTo(Food::class);
    }
}
