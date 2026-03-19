<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Pusher\Pusher;

class WelcomeController extends Controller
{
    public function presenceAuth(Request $request): JsonResponse
    {
        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');

        if ($channelName !== 'presence-welcome') {
            abort(403);
        }

        $user = $request->user();

        if ($user) {
            $userId = (string) $user->id;
            $userInfo = ['name' => $user->name];
        } else {
            $guestId = $request->session()->get('welcome_guest_id');

            if (! $guestId) {
                $guestId = 'guest-'.Str::random(8);
                $request->session()->put('welcome_guest_id', $guestId);
            }

            $userId = $guestId;
            $userInfo = ['name' => 'Visitor'];
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
