<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            //// ... dentro del Blueprint $table en el método up()
            // Cambia esto:
            // $table->integer('monitor_interval_hours')->default(24);

            // Por esto:
            $table->integer('monitor_interval_minutes')->default(15);
            $table->boolean('is_monitoring_active')->default(true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            //
        });
    }
};
