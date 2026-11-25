<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per boss a hunter has beaten (the first win counts; later wins update the best time).
        Schema::create('arena_boss_defeats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('boss', 40);
            $table->unsignedInteger('wins')->default(1);
            $table->unsignedInteger('best_ms');
            $table->timestamp('first_defeated_at');
            $table->timestamps();
            $table->unique(['user_id', 'boss']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arena_boss_defeats');
    }
};
