<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Product;
use App\Models\PriceHistory;
use App\Services\ScraperService;
use Illuminate\Support\Facades\Log;

class ScrapePrices extends Command
{
    protected $signature = 'scrape:prices';
    protected $description = 'Monitorea los enlaces y guarda el historial de precios';

    public function handle(ScraperService $scraper)
    {
        $this->info('Iniciando monitoreo de precios...');
        $products = Product::where('is_monitoring_active', true)->get();

        foreach ($products as $product) {
            try {
                $lastHistory = $product->priceHistories()->latest()->first();
                $minutesPassed = $lastHistory ? $lastHistory->created_at->diffInMinutes(now()) : 9999;

                if ($minutesPassed >= $product->monitor_interval_minutes) {
                    $this->info("Extrayendo: {$product->title}");
                    $result = $scraper->scrapeUrl($product->affiliate_url);

                    // Validación robusta del precio
                    if ($result['success'] && !empty($result['data']['price']) && $result['data']['price'] > 0) {
                        PriceHistory::create([
                            'product_id' => $product->id,
                            'price' => $result['data']['price']
                        ]);
                        $product->update(['price' => $result['data']['price']]);

                        $this->info("✅ Éxito: Nuevo precio -> $" . $result['data']['price']);
                    } else {
                        $this->error("⚠️ Fallo o precio no encontrado para: {$product->title}");
                        // Opcional: Registrar en Laravel logs
                        Log::warning("Scraping falló para producto ID: {$product->id}", ['url' => $product->affiliate_url]);
                    }
                } else {
                    $this->line("⏳ Omitiendo {$product->title} (Faltan minutos...)");
                }
            } catch (\Exception $e) {
                // Si el servidor de la tienda se cae o bloquea, capturamos el error y continuamos
                $this->error("❌ Error crítico en {$product->title}: " . $e->getMessage());
                continue; // Pasa al siguiente producto sin romper el comando
            }
        }
        $this->info('Monitoreo finalizado.');
    }
}
