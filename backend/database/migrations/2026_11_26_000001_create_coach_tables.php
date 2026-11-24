<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What you told the coach about yourself: goals, situation, how hard to push you.
        if (! Schema::hasColumn('users', 'coach_profile')) {
            Schema::table('users', function (Blueprint $table) {
                $table->text('coach_profile')->nullable()->after('protein_goal');
            });
        }

        if (! Schema::hasTable('coach_messages')) {
            Schema::create('coach_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('role', 10);          // user | coach
                $table->text('content');
                $table->string('kind', 10)->default('chat'); // chat | daily
                $table->timestamps();
                $table->index(['user_id', 'id']);
            });
        }

        // A quest the coach suggested. Nothing is created until you accept it.
        if (! Schema::hasTable('coach_proposals')) {
            Schema::create('coach_proposals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('coach_message_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('skill_id')->nullable();
                $table->unsignedBigInteger('task_id')->nullable(); // set once accepted
                $table->string('title', 120);
                $table->text('description')->nullable();
                $table->string('tier', 1);
                $table->text('reason')->nullable();
                $table->json('schedule')->nullable();
                $table->string('status', 10)->default('pending'); // pending | accepted | dismissed
                $table->timestamps();
                $table->index(['user_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('coach_proposals');
        Schema::dropIfExists('coach_messages');
        if (Schema::hasColumn('users', 'coach_profile')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn('coach_profile'));
        }
    }
};
