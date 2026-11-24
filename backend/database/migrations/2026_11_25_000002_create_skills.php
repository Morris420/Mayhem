<?php

use Database\Seeders\SkillSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('skills')) {
            Schema::create('skills', function (Blueprint $table) {
                $table->id();
                $table->string('slug', 30)->unique();
                $table->string('name', 40);
                $table->string('description', 160);
                $table->string('icon', 30);
                $table->unsignedSmallInteger('sort')->default(0);
                $table->timestamps();
            });
        }

        // The ledger: every XP gain, with where it came from. A skill's level is computed from its sum.
        if (! Schema::hasTable('skill_xp')) {
            Schema::create('skill_xp', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('skill_id');
                $table->unsignedInteger('amount');
                $table->string('source', 12);   // quest | gym | diet | achievement
                $table->string('ref', 40);      // "q:12", "g:7", "d:2026-11-24", "a:5": one row per cause, so it is never counted twice
                $table->date('date');
                $table->timestamps();
                $table->unique(['user_id', 'ref']);
                $table->index(['user_id', 'skill_id']);
            });
        }

        if (! Schema::hasColumn('tasks', 'skill_id')) {
            Schema::table('tasks', function (Blueprint $table) {
                $table->unsignedBigInteger('skill_id')->nullable()->after('achievement_id');
            });
        }

        (new SkillSeeder)->run();

        // Existing quests train Discipline until you pick something else.
        $discipline = DB::table('skills')->where('slug', 'discipline')->value('id');
        DB::table('tasks')->whereNull('skill_id')->update(['skill_id' => $discipline]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('tasks', 'skill_id')) {
            Schema::table('tasks', fn (Blueprint $table) => $table->dropColumn('skill_id'));
        }
        Schema::dropIfExists('skill_xp');
        Schema::dropIfExists('skills');
    }
};
