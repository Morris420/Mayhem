<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // An exercise you do: which body part, which weekdays, and an optional weight goal.
        Schema::create('exercises', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('body_part', 20);
            $table->json('weekdays')->nullable();           // ISO weekdays 1..7 it is scheduled on
            $table->decimal('goal_weight', 6, 2)->nullable(); // kg you want to reach...
            $table->date('goal_date')->nullable();            // ...by this date
            $table->softDeletes();                            // keep history when you remove one
            $table->timestamps();
            $table->index('user_id');
        });

        // One row = "on this day I lifted this weight for this exercise".
        Schema::create('exercise_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exercise_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('weight', 6, 2);
            $table->unsignedTinyInteger('sets')->nullable();
            $table->unsignedSmallInteger('reps')->nullable();
            $table->timestamps();
            $table->unique(['exercise_id', 'date']);
            $table->index(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exercise_logs');
        Schema::dropIfExists('exercises');
    }
};
