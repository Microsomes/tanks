<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameResult extends Model
{
    protected $fillable = [
        'room_code',
        'map_name',
        'player_count',
        'winner_name',
        'winner_identifier',
    ];
}
