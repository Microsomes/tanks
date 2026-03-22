<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('active_rooms', function (Blueprint $table) {
            $table->id();
            $table->string('room_code', 4)->unique();
            $table->string('host_name');
            $table->string('map_name')->default('classic');
            $table->integer('player_count')->default(1);
            $table->string('status')->default('lobby');
            $table->integer('max_players')->default(8);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('active_rooms');
    }
};
