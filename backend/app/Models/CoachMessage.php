<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One line of the conversation with the coach. */
#[Fillable(['user_id', 'role', 'content', 'kind'])]
class CoachMessage extends Model
{
    public function proposals(): HasMany
    {
        return $this->hasMany(CoachProposal::class);
    }
}
