<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Quests can now be scheduled (one date, or repeating on weekdays), and every
     * time you finish one we store a row in `task_completions`. That row is the
     * single source of truth for XP history, streaks and the charts.
     *
     * Non-destructive: existing `completed_at` values are copied into the new table first.
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->json('recurrence')->nullable();        // [1..7] ISO weekdays, Monday = 1
            $table->date('scheduled_date')->nullable();     // one-off on a specific day
            $table->date('starts_on')->nullable();          // first day a recurring quest applies
            $table->softDeletes();                          // deleting keeps your history intact
        });

        Schema::create('task_completions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('xp');                  // XP at the time (editing a quest later won't rewrite history)
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['task_id', 'date']);
            $table->index(['user_id', 'date']);
        });

        // Carry over everything completed under the old one-off model.
        DB::table('tasks')->whereNotNull('completed_at')->orderBy('id')->each(function ($task) {
            DB::table('task_completions')->insert([
                'user_id' => $task->user_id,
                'task_id' => $task->id,
                'date' => substr($task->completed_at, 0, 10),
                'xp' => $task->xp,
                'completed_at' => $task->completed_at,
                'created_at' => $task->completed_at,
                'updated_at' => $task->completed_at,
            ]);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'completed_at']);
        });
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('completed_at')->nullable();
        });

        DB::table('task_completions')->orderBy('id')->each(function ($c) {
            DB::table('tasks')->where('id', $c->task_id)->whereNull('completed_at')->update(['completed_at' => $c->completed_at]);
        });

        Schema::dropIfExists('task_completions');

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn(['recurrence', 'scheduled_date', 'starts_on']);
            $table->index(['user_id', 'completed_at']);
        });
    }
};
