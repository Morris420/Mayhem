<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('google_connections')) {
            Schema::create('google_connections', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->text('access_token');
                $table->text('refresh_token')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->string('mayhem_calendar_id')->nullable(); // the separate "Mayhem" calendar we write to
                $table->boolean('push_enabled')->default(true);
                $table->timestamp('last_synced_at')->nullable();
                $table->timestamps();
            });
        }

        // Events read from your Google calendars (a cache, rebuilt on every sync).
        if (! Schema::hasTable('google_events')) {
            Schema::create('google_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('calendar_id');
                $table->string('calendar_name')->nullable();
                $table->string('google_id');
                $table->string('title');
                $table->date('start_date');
                $table->date('end_date');          // inclusive last day
                $table->string('start_time', 5)->nullable(); // "14:30", null = all day
                $table->string('end_time', 5)->nullable();
                $table->string('link')->nullable();
                $table->timestamps();
                $table->unique(['calendar_id', 'google_id', 'user_id'], 'google_events_unique');
                $table->index(['user_id', 'start_date']);
            });
        }

        // Which quest occurrence became which event in the Mayhem calendar.
        if (! Schema::hasTable('google_pushed')) {
            Schema::create('google_pushed', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('task_id');
                $table->date('date');
                $table->string('google_event_id');
                $table->string('title');
                $table->string('status', 10)->default('synced'); // synced | removed (you deleted it in Google)
                $table->timestamps();
                $table->unique(['user_id', 'task_id', 'date']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('google_pushed');
        Schema::dropIfExists('google_events');
        Schema::dropIfExists('google_connections');
    }
};
