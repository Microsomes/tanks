<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerStat extends Model
{
    protected $fillable = [
        'identifier',
        'nickname',
        'games_played',
        'wins',
        'kills',
        'deaths',
    ];

    public function winRate(): float
    {
        if ($this->games_played === 0) {
            return 0.0;
        }

        return round(($this->wins / $this->games_played) * 100, 1);
    }
}
