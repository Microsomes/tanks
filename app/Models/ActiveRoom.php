<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActiveRoom extends Model
{
    protected $fillable = [
        'room_code',
        'host_name',
        'map_name',
        'player_count',
        'players_json',
        'status',
        'max_players',
        'game_mode',
    ];

    protected function casts(): array
    {
        return [
            'players_json' => 'array',
        ];
    }
}
