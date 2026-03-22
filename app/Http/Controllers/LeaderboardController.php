<?php

namespace App\Http\Controllers;

use App\Models\ActiveRoom;
use App\Models\GameResult;
use App\Models\PlayerStat;
use Illuminate\Http\JsonResponse;

class LeaderboardController extends Controller
{
    public function topPlayers(): JsonResponse
    {
        $players = PlayerStat::orderByDesc('wins')
            ->limit(20)
            ->get()
            ->map(function (PlayerStat $player) {
                return [
                    'id' => $player->id,
                    'identifier' => $player->identifier,
                    'nickname' => $player->nickname,
                    'games_played' => $player->games_played,
                    'wins' => $player->wins,
                    'kills' => $player->kills,
                    'deaths' => $player->deaths,
                    'win_rate' => $player->winRate(),
                ];
            });

        return response()->json($players);
    }

    public function recentGames(): JsonResponse
    {
        $games = GameResult::orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json($games);
    }

    public function activeRooms(): JsonResponse
    {
        $rooms = ActiveRoom::all();

        return response()->json($rooms);
    }
}
