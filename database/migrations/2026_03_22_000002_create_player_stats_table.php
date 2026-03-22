<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('player_stats', function (Blueprint $table) {
            $table->id();
            $table->string('identifier')->index();
            $table->string('nickname');
            $table->integer('games_played')->default(0);
            $table->integer('wins')->default(0);
            $table->integer('kills')->default(0);
            $table->integer('deaths')->default(0);
            $table->timestamps();

            $table->unique('identifier');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('player_stats');
    }
};
