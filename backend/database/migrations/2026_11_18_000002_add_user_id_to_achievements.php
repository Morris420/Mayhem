<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // null = built-in achievement (everyone sees it); set = a custom one only its owner sees.
        Schema::table('achievements', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('achievements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
