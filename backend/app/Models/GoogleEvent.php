<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'calendar_id', 'calendar_name', 'google_id', 'title', 'start_date', 'end_date', 'start_time', 'end_time', 'link'])]
class GoogleEvent extends Model
{
    protected function casts(): array
    {
        return ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d'];
    }

    public function present(): array
    {
        return [
            'id' => $this->id, 'title' => $this->title, 'calendar' => $this->calendar_name,
            'start_time' => $this->start_time, 'end_time' => $this->end_time,
            'all_day' => $this->start_time === null, 'link' => $this->link,
        ];
    }
}
