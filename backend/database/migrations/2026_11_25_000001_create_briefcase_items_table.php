<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('briefcase_items')) {
            return;
        }

        Schema::create('briefcase_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('parent_id')->nullable(); // the folder it sits in (null = top level)
            $table->string('kind', 10);                          // folder | file | link
            $table->string('name', 120);
            $table->string('path')->nullable();                  // where a file lives on the private disk
            $table->string('extension', 10)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->string('url', 500)->nullable();              // for links (Google Sheets, Drive, ...)
            $table->unsignedInteger('version')->default(1);      // goes up each time you replace a file
            $table->timestamps();
            $table->index(['user_id', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('briefcase_items');
    }
};
