<?php

use App\Http\Controllers\GameController;
use App\Http\Controllers\WelcomeController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::inertia('/', 'Welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

Route::post('/welcome/presence-auth', [WelcomeController::class, 'presenceAuth']);
Route::inertia('/docs', 'Docs')->name('docs');

Route::get('/game', [GameController::class, 'index'])->name('game');
Route::post('/game/presence-auth', [GameController::class, 'presenceAuth']);

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'Dashboard')->name('dashboard');
});

require __DIR__.'/settings.php';
