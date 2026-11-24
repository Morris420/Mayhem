<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'skill_id', 'amount', 'source', 'ref', 'date'])]
class SkillXp extends Model
{
    protected $table = 'skill_xp';

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
