<?php

use Database\Seeders\AchievementSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Achievements can now unlock by themselves from your gym / diet data
        // (rule + threshold), instead of only via linked quests.
        if (! Schema::hasColumn('achievements', 'rule')) {
            Schema::table('achievements', function (Blueprint $table) {
                $table->string('rule', 30)->nullable();
                $table->unsignedInteger('threshold')->nullable();
            });
        }

        // Daily extras you want to tick off: vitamins, fruit, vegetables...
        if (! Schema::hasTable('checklist_items')) {
            Schema::create('checklist_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('name', 60);
                $table->boolean('active')->default(true); // removing = hiding, so history stays
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('checklist_checks')) {
            Schema::create('checklist_checks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('checklist_item_id')->constrained('checklist_items')->cascadeOnDelete();
                $table->date('date');
                $table->timestamps();
                $table->unique(['checklist_item_id', 'date']);
                $table->index(['user_id', 'date']);
            });
        }

        // Bring the built-in catalog up to date (idempotent): adds the new gym/diet
        // achievements and turns Iron Body / Iron Chef into automatic ones.
        (new AchievementSeeder)->run();
    }

    public function down(): void
    {
        Schema::dropIfExists('checklist_checks');
        Schema::dropIfExists('checklist_items');
        Schema::table('achievements', function (Blueprint $table) {
            $table->dropColumn(['rule', 'threshold']);
        });
    }
};
