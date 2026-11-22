<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'kcal_goal')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedSmallInteger('kcal_goal')->default(2500);   // daily calories you aim for
                $table->unsignedSmallInteger('protein_goal')->default(150); // daily grams of protein
            });
        }

        // Your personal food library. Filled from Open Food Facts or typed in by hand.
        if (! Schema::hasTable('foods')) {
            Schema::create('foods', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('code', 40)->nullable();          // barcode from Open Food Facts
                $table->string('name', 160);
                $table->string('brand', 120)->nullable();
                $table->string('source', 10)->default('manual');   // 'off' | 'manual'
                $table->decimal('kcal_100g', 7, 2);
                $table->decimal('protein_100g', 6, 2);
                $table->decimal('serving_g', 7, 2)->nullable();    // a typical portion in grams
                $table->timestamps();
                $table->unique(['user_id', 'code']);
            });
        }

        // One row = "I ate this much of this food on this day". Values are copied in
        // so history never changes if a food is edited later.
        if (! Schema::hasTable('meal_entries')) {
            Schema::create('meal_entries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('food_id')->nullable()->constrained('foods')->nullOnDelete(); // 'food' is uncountable, so name the table
                $table->date('date');
                $table->string('name', 160);
                $table->decimal('grams', 7, 2);
                $table->decimal('kcal_100g', 7, 2);
                $table->decimal('protein_100g', 6, 2);
                $table->decimal('kcal', 8, 2);
                $table->decimal('protein', 7, 2);
                $table->timestamps();
                $table->index(['user_id', 'date']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('meal_entries');
        Schema::dropIfExists('foods');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['kcal_goal', 'protein_goal']);
        });
    }
};
