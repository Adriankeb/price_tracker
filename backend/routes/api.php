<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

use App\Http\Controllers\Api\ProductController;

Route::get('/products', [ProductController::class, 'index']);
Route::post('/products/scrape-analyze', [ProductController::class, 'scrapeAndAnalyze']);
Route::post('/products', [ProductController::class, 'store']);
Route::get('/scrape-logs', [ProductController::class, 'logs']);

// <-- NUEVA RUTA -->
Route::get('/products/{id}/history', [ProductController::class, 'history']);