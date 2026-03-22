<?php

use App\Http\Controllers\GameController;
use App\Http\Controllers\LeaderboardController;
use Illuminate\Support\Facades\Route;

Route::get('/', [GameController::class, 'index'])->name('home');

Route::inertia('/docs', 'Docs')->name('docs');

Route::post('/game/presence-auth', [GameController::class, 'presenceAuth']);

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'Dashboard')->name('dashboard');
});

// API endpoints for game tracking
Route::middleware('throttle:30,1')->group(function () {
    Route::post('/api/game/report', [GameController::class, 'reportGameEnd']);
    Route::post('/api/game/room/register', [GameController::class, 'registerRoom']);
    Route::post('/api/game/room/unregister', [GameController::class, 'unregisterRoom']);
    Route::post('/api/game/room/update', [GameController::class, 'updateRoom']);
    Route::post('/api/game/session/save', [GameController::class, 'saveSession']);
    Route::post('/api/game/session/clear', [GameController::class, 'clearRoomSessions']);
});

Route::middleware('throttle:60,1')->group(function () {
    Route::get('/api/leaderboard/top', [LeaderboardController::class, 'topPlayers']);
    Route::get('/api/leaderboard/recent', [LeaderboardController::class, 'recentGames']);
    Route::get('/api/rooms', [LeaderboardController::class, 'activeRooms']);
    Route::get('/api/game/session', [GameController::class, 'getSession']);
    Route::get('/api/game/session/room', [GameController::class, 'getRoomSessions']);
});

require __DIR__.'/settings.php';
