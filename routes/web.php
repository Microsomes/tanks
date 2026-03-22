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
Route::post('/api/game/report', [GameController::class, 'reportGameEnd']);
Route::post('/api/game/room/register', [GameController::class, 'registerRoom']);
Route::post('/api/game/room/unregister', [GameController::class, 'unregisterRoom']);
Route::post('/api/game/room/update', [GameController::class, 'updateRoom']);
Route::get('/api/leaderboard/top', [LeaderboardController::class, 'topPlayers']);
Route::get('/api/leaderboard/recent', [LeaderboardController::class, 'recentGames']);
Route::get('/api/rooms', [LeaderboardController::class, 'activeRooms']);

// Game session persistence
Route::post('/api/game/session/save', [GameController::class, 'saveSession']);
Route::get('/api/game/session', [GameController::class, 'getSession']);
Route::get('/api/game/session/room', [GameController::class, 'getRoomSessions']);
Route::post('/api/game/session/clear', [GameController::class, 'clearRoomSessions']);

require __DIR__.'/settings.php';
