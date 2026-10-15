<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ScrapeLog;
use App\Services\ScraperService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Models\PriceHistory; // <-- AGREGA ESTO ARRIBA

class ProductController extends Controller
{
    public function index(): JsonResponse
    {
        $products = Product::with('scrapeLogs')->latest()->get();

        return response()->json($products);
    }

    // Endpoint 1: Extraer datos en vivo y guardar el log de monitoreo
    public function scrapeAndAnalyze(Request $request, ScraperService $scraper): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url', 'max:2048'],
        ]);
        $url = trim($validated['url']);
        $result = $scraper->scrapeUrl($url);

        $log = ScrapeLog::create([
            'target_url' => $url,
            'status' => $result['success'] ? 'success' : 'failed',
            'http_status_code' => $result['status_code'],
            'duration_ms' => $result['duration_ms'],
            'error_message' => $result['error'] ?? null,
        ]);

        return response()->json([
            'scraped_data' => $result['data'],
            'log' => $log,
            'status' => $result['success'] ? 'success' : 'failed',
            'message' => $result['success']
                ? 'Información extraída correctamente.'
                : ($result['error'] ?? 'No fue posible extraer información de este enlace.'),
        ], 200);
    }

    // Endpoint 2: Guardar oferta estilo Promodescuentos
public function store(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'title' => 'required|string|max:255',
                'price' => 'required|numeric',
                'original_price' => 'nullable|numeric',
                'store' => 'required|string',
                'affiliate_url' => 'required|url',
                'image_url' => 'nullable|string',
                'description' => 'nullable|string',
                'coupon_code' => 'nullable|string',
                'scrape_log_id' => 'nullable|exists:scrape_logs,id',
                'monitor_interval_minutes' => 'nullable|integer'
            ]);

            $discount = 0;
            if (!empty($validated['original_price']) && $validated['original_price'] > $validated['price']) {
                $discount = round((($validated['original_price'] - $validated['price']) / $validated['original_price']) * 100);
            }
            $validated['discount_percentage'] = $discount;

            // Crea el producto principal (usando la ruta completa al modelo para evitar errores de importación)
            $product = \App\Models\Product::create($validated);

            // --- LO NUEVO: GUARDAR EL PRECIO INICIAL EN LA GRÁFICA ---
            \App\Models\PriceHistory::create([
                'product_id' => $product->id,
                'price' => $product->price
            ]);
            // ---------------------------------------------------------

            if (!empty($validated['scrape_log_id'])) {
                \App\Models\ScrapeLog::where('id', $validated['scrape_log_id'])->update(['product_id' => $product->id]);
            }

            return response()->json($product, 201);

        } catch (\Exception $e) {
            // Atrapa el error y lo envía como respuesta JSON para leerlo en React
            return response()->json([
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // --- AGREGA ESTE NUEVO MÉTODO AL FINAL DEL CONTROLADOR ---
public function history(string $id): JsonResponse
    {
        // Trae todos los precios de ese producto ordenados del más antiguo al más reciente
        $history = PriceHistory::where('product_id', $id)
            ->orderBy('created_at', 'asc')
            ->get(['price', 'created_at']);

        return response()->json($history);
    }
}
