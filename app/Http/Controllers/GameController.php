<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Pusher\Pusher;

class GameController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Game');
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
                $guestId = 'guest-' . Str::random(8);
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
