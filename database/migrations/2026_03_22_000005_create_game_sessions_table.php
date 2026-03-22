<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('room_code', 4)->index();
            $table->string('player_identifier')->index(); // guest id or user id
            $table->string('nickname');
            $table->string('color')->default('#4ade80');
            $table->string('map_name')->default('classic');
            $table->integer('spawn_index')->default(0);
            $table->integer('hp')->default(5);
            $table->float('x')->default(0);
            $table->float('z')->default(0);
            $table->float('body_rotation')->default(0);
            $table->boolean('alive')->default(true);
            $table->boolean('is_admin')->default(false);
            $table->timestamps();

            $table->unique(['room_code', 'player_identifier']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_sessions');
    }
};
