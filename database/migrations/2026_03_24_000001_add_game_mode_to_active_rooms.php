<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('active_rooms', function (Blueprint $table) {
            $table->string('game_mode', 20)->default('classic')->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('active_rooms', function (Blueprint $table) {
            $table->dropColumn('game_mode');
        });
    }
};
