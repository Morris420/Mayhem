<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'task_id', 'date', 'google_event_id', 'title', 'status'])]
class GooglePushed extends Model
{
    protected $table = 'google_pushed';

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
