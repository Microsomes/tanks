<?php

namespace App\Http\Controllers;

use App\Models\ActiveRoom;
use App\Models\GameResult;
use App\Models\GameSession;
use App\Models\PlayerStat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Pusher\Pusher;

class GameController extends Controller
{
    public function index(): Response
    {
        // Clean up stale rooms (no update in 10 minutes)
        ActiveRoom::where('updated_at', '<', now()->subMinutes(10))->delete();

        // Get or create guest ID for session lookup
        $user = request()->user();
        $playerId = $user ? (string) $user->id : (session('game_guest_id') ?: '');

        // Check if this player has an active game session
        $activeSession = $playerId
            ? GameSession::where('player_identifier', $playerId)->first()
            : null;

        return Inertia::render('Game', [
            'topPlayers' => PlayerStat::orderByDesc('wins')->limit(10)->get(),
            'activeRooms' => ActiveRoom::all(),
            'recentGames' => GameResult::orderByDesc('created_at')->limit(10)->get(),
            'activeSession' => $activeSession,
        ]);
    }

    public function reportGameEnd(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'room_code' => 'required|string|max:4',
            'winner_name' => 'required|string',
            'winner_identifier' => 'required|string',
            'player_count' => 'required|integer|min:1',
            'map_name' => 'required|string',
            'players' => 'required|array',
            'players.*.identifier' => 'required|string',
            'players.*.nickname' => 'required|string',
            'players.*.kills' => 'required|integer|min:0',
            'players.*.deaths' => 'required|integer|min:0',
            'players.*.won' => 'required|boolean',
        ]);

        // Sanity checks
        if (count($validated['players']) !== $validated['player_count']) {
            return response()->json(['error' => 'Player count mismatch'], 422);
        }

        $winnerFound = false;
        foreach ($validated['players'] as $player) {
            if ($player['kills'] > 50 || $player['deaths'] > 50) {
                return response()->json(['error' => 'Invalid stats'], 422);
            }
            if ($player['identifier'] === $validated['winner_identifier']) {
                $winnerFound = true;
            }
        }

        if (!$winnerFound) {
            return response()->json(['error' => 'Winner not in players list'], 422);
        }

        DB::transaction(function () use ($validated) {
            GameResult::create([
                'room_code' => $validated['room_code'],
                'map_name' => $validated['map_name'],
                'player_count' => $validated['player_count'],
                'winner_name' => $validated['winner_name'],
                'winner_identifier' => $validated['winner_identifier'],
            ]);

            foreach ($validated['players'] as $player) {
                $stat = PlayerStat::firstOrCreate(
                    ['identifier' => $player['identifier']],
                    ['nickname' => $player['nickname'], 'games_played' => 0, 'wins' => 0, 'kills' => 0, 'deaths' => 0]
                );

                $stat->nickname = $player['nickname'];
                $stat->games_played += 1;
                $stat->kills += $player['kills'];
                $stat->deaths += $player['deaths'];

                if ($player['won']) {
                    $stat->wins += 1;
                }

                $stat->save();
            }

            ActiveRoom::where('room_code', $validated['room_code'])->delete();
            GameSession::where('room_code', $validated['room_code'])->delete();
        });

        return response()->json(['success' => true]);
    }

    public function registerRoom(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'room_code' => 'required|string|max:4',
            'host_name' => 'required|string',
            'map_name' => 'sometimes|string',
            'player_count' => 'sometimes|integer|min:1',
            'status' => 'sometimes|string|in:lobby,playing',
            'player_names' => 'sometimes|array',
            'game_mode' => 'sometimes|string|in:classic,deathmatch',
        ]);

        $data = collect($validated)->except('player_names')->toArray();
        if (isset($validated['player_names'])) {
            $data['players_json'] = $validated['player_names'];
        }

        ActiveRoom::updateOrCreate(
            ['room_code' => $validated['room_code']],
            $data
        );

        return response()->json(['success' => true]);
    }

    public function unregisterRoom(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'room_code' => 'required|string|max:4',
        ]);

        ActiveRoom::where('room_code', $validated['room_code'])->delete();

        return response()->json(['success' => true]);
    }

    public function updateRoom(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'room_code' => 'required|string|max:4',
            'player_count' => 'sometimes|integer|min:0',
            'status' => 'sometimes|string|in:lobby,playing',
            'map_name' => 'sometimes|string',
            'player_names' => 'sometimes|array',
        ]);

        $room = ActiveRoom::where('room_code', $validated['room_code'])->first();

        if (! $room) {
            return response()->json(['error' => 'Room not found'], 404);
        }

        $data = collect($validated)->except('room_code', 'player_names')->toArray();
        if (isset($validated['player_names'])) {
            $data['players_json'] = $validated['player_names'];
        }

        $room->update($data);

        return response()->json(['success' => true]);
    }

    public function saveSession(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'room_code' => 'required|string|max:4',
            'player_identifier' => 'required|string',
            'nickname' => 'required|string',
            'color' => 'sometimes|string',
            'map_name' => 'sometimes|string',
            'spawn_index' => 'sometimes|integer',
            'hp' => 'sometimes|integer',
            'x' => 'sometimes|numeric',
            'z' => 'sometimes|numeric',
            'body_rotation' => 'sometimes|numeric',
            'alive' => 'sometimes|boolean',
            'is_admin' => 'sometimes|boolean',
        ]);

        GameSession::updateOrCreate(
            ['room_code' => $validated['room_code'], 'player_identifier' => $validated['player_identifier']],
            $validated
        );

        return response()->json(['success' => true]);
    }

    public function getSession(Request $request): JsonResponse
    {
        $roomCode = $request->query('room_code');
        $playerId = $request->query('player_identifier');

        if (! $roomCode || ! $playerId) {
            return response()->json(['session' => null]);
        }

        $session = GameSession::where('room_code', $roomCode)
            ->where('player_identifier', $playerId)
            ->first();

        return response()->json(['session' => $session]);
    }

    public function getRoomSessions(Request $request): JsonResponse
    {
        $roomCode = $request->query('room_code');

        if (! $roomCode) {
            return response()->json(['sessions' => []]);
        }

        $sessions = GameSession::where('room_code', $roomCode)->get();

        return response()->json(['sessions' => $sessions]);
    }

    public function clearRoomSessions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'room_code' => 'required|string|max:4',
        ]);

        GameSession::where('room_code', $validated['room_code'])->delete();

        return response()->json(['success' => true]);
    }

    public function presenceAuth(Request $request): JsonResponse
    {
        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');

        if (! str_starts_with($channelName, 'presence-game.')) {
            abort(403);
        }

        $user = $request->user();
        $nickname = $request->input('nickname', 'Player');
        $color = $request->input('color', '#4ade80');

        if ($user) {
            $userId = (string) $user->id;
            $userInfo = ['name' => $nickname ?: $user->name, 'color' => $color];
        } else {
            $guestId = $request->session()->get('game_guest_id');

            if (! $guestId) {
                $guestId = 'guest-' . Str::random(16);
                $request->session()->put('game_guest_id', $guestId);
            }

            $userId = $guestId;
            $userInfo = ['name' => $nickname ?: 'Player', 'color' => $color];
        }

        $pusher = new Pusher(
            config('broadcasting.connections.reverb.key'),
            config('broadcasting.connections.reverb.secret'),
            config('broadcasting.connections.reverb.app_id'),
        );

        $auth = $pusher->authorizePresenceChannel(
            $channelName,
            $socketId,
            $userId,
            $userInfo,
        );

        return response()->json(json_decode($auth));
    }
}
