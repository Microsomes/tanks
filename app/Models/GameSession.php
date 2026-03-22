<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameSession extends Model
{
    protected $fillable = [
        'room_code',
        'player_identifier',
        'nickname',
        'color',
        'map_name',
        'spawn_index',
        'hp',
        'x',
        'z',
        'body_rotation',
        'alive',
        'is_admin',
    ];

    protected function casts(): array
    {
        return [
            'alive' => 'boolean',
            'is_admin' => 'boolean',
        ];
    }
}
