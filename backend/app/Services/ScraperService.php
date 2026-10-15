<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use Symfony\Component\DomCrawler\Crawler;

class ScraperService
{
    public function scrapeUrl(string $url): array
    {
        $startTime = microtime(true);
        $host = parse_url($url, PHP_URL_HOST) ?? '';

        // 1. Configurar Cookies específicas por tienda para forzar la región MXN (México)
        $domainCookies = [];
        if (str_contains($host, 'shein')) {
            $domainCookies = ['br_cc' => 'MX', 'br_lang' => 'es'];
        } elseif (str_contains($host, 'temu')) {
            $domainCookies = ['region' => '232', 'currency' => 'MXN', 'language' => 'es'];
        }

        $cookieJar = CookieJar::fromArray($domainCookies, $host);

        $client = new Client([
            'timeout' => 15,
            'http_errors' => false,
            'verify' => (bool) config('scraper.verify_ssl', true),
            'cookies' => $cookieJar,
            'headers' => [
                'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language' => 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Cache-Control' => 'no-cache',
                'Sec-Ch-Ua' => '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                'Sec-Ch-Ua-Mobile' => '?0',
                'Sec-Ch-Ua-Platform' => '"Windows"',
                'Sec-Fetch-Dest' => 'document',
                'Sec-Fetch-Mode' => 'navigate',
                'Sec-Fetch-Site' => 'none',
                'Sec-Fetch-User' => '?1',
                'Upgrade-Insecure-Requests' => '1',
            ],
        ]);

        try {
            $response = $client->get($url);
            $statusCode = $response->getStatusCode();
            $html = (string) $response->getBody();
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);

            if ($statusCode >= 400) {
                return [
                    'success' => false,
                    'data' => null,
                    'status_code' => $statusCode,
                    'duration_ms' => $durationMs,
                    'error' => "El sitio respondió con HTTP {$statusCode}. Puede estar bloqueando solicitudes automatizadas.",
                ];
            }

            $crawler = new Crawler($html);

            // Intentar extraer de datos estructurados (Schema.org / JSON-LD) primero
            $structuredProduct = $this->extractStructuredProduct($crawler);

            // 2. Títulos
            $titleSelectors = [
                'h1.product-title',
                '.product-intro__head-name',
                'h1[data-test="product-title"]',
                'h1.a-size-large',
                'h1.o-product__description',
                'h1',
                'meta[property="og:title"]',
                'title'
            ];
            $title = $this->extractText($crawler, $titleSelectors) ?: $structuredProduct['title'];

            // 3. Imágenes con prioridad a la galería real del producto
            $image = $structuredProduct['image'] ?: $this->extractImage($crawler);
            $image = $this->resolveUrl($image, $url);
            $description = $this->extractAttribute($crawler, ['meta[property="og:description"]', 'meta[name="description"]'], 'content');

            // 4. PRECIOS EN OFERTA
            $priceSelectors = [
                '[data-testid="discounted"]', // <-- Agregado para Liverpool
                '.text-price-primary',        // <-- Agregado para Liverpool (Alternativa)
                '[itemprop="price"]',
                '.a-price-whole',
                '.ui-pdp-price__part',
                '.andes-money-amount__fraction',
                '.product-intro__head-price .original',
                '.discount-price',
                'div[data-test="price"]',
                '.a-price .a-offscreen',
                'p.a-product__paragraphDiscountPrice',
                '.price',
                '.product-price',
                '[data-price]',
            ];
            $priceText = $this->extractText($crawler, $priceSelectors);

            if (!$priceText && preg_match('/"currentPrice":\s*([\d.]+)/i', $html, $matches)) {
                $priceText = $matches[1];
            }

            $cleanPrice = $structuredProduct['price'] ?: $this->parsePrice($priceText);

            // 5. PRECIOS REGULARES (Originales)
            $originalPriceSelectors = [
                '[data-testid="original"]',
                '[itemprop="priceBeforeDiscount"]',
                '[itemprop="highPrice"]',
                '.a-text-price .a-offscreen',
                '.ui-pdp-price__original-value',
                '.del-price',
                'del',
                'p.a-product__paragraphRegularPrice',
                '.old-price',
                '.oldPrice',
                '.list-price',
                '.price-before',
                '[class*="old-price"]',
                '[class*="list-price"]',
                '.ui-pdp-price__original',
                '.andes-money-amount--previous',
                's',
            ];
            $originalPriceText = $this->extractText($crawler, $originalPriceSelectors);

            if (!$originalPriceText && preg_match('/"originalPrice":\s*([\d.]+)/i', $html, $matches)) {
                $originalPriceText = $matches[1];
            }

            $originalPrice = $this->parsePrice($originalPriceText) ?: $structuredProduct['original_price'];

            return [
                'success' => true,
                'data' => [
                    'title' => $title ?: 'Oferta detectada',
                    'price' => $cleanPrice ?: null,
                    'original_price' => $originalPrice ?: null,
                    'image_url' => $image,
                    'description' => $description ?: 'Sin descripción detallada.',
                    'store' => parse_url($url, PHP_URL_HOST) ?? 'Web',
                    'raw_html' => $html,
                ],
                'status_code' => $statusCode,
                'duration_ms' => $durationMs,
                'error' => null,
            ];
        } catch (\Throwable $e) {
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);

            return [
                'success' => false,
                'data' => null,
                'status_code' => method_exists($e, 'getResponse') && $e->getResponse() ? $e->getResponse()->getStatusCode() : 500,
                'duration_ms' => $durationMs,
                'error' => $e->getMessage(),
            ];
        }
    }

    private function extractText(Crawler $crawler, array $selectors): ?string
    {
        foreach ($selectors as $selector) {
            $node = $crawler->filter($selector);
            if ($node->count()) {
                $content = $node->first()->attr('content');
                if ($content !== null) {
                    return trim($content);
                }
                return trim($node->first()->text());
            }
        }
        return null;
    }

    private function extractAttribute(Crawler $crawler, array $selectors, string $attr): ?string
    {
        foreach ($selectors as $selector) {
            $node = $crawler->filter($selector);
            if ($node->count() && $node->attr($attr)) {
                return trim($node->attr($attr));
            }
        }
        return null;
    }

    private function extractImage(Crawler $crawler): ?string
    {
        // 1. PRIORIDAD MÁXIMA: Buscar en los contenedores principales de la galería por tienda
        $storeSpecificSelectors = [
            '#imgTagWrapperId img', // Amazon: Imagen principal del producto
            '#landingImage', // Amazon: Alternativa
            '.ui-pdp-gallery__figure img', // Mercado Libre
            '.product-intro__main-image img', // Shein
            'img[data-test="product-image"]', // Temu
            '.o-product__image img', // Liverpool
        ];

        foreach ($storeSpecificSelectors as $selector) {
            $image = $this->extractImageAttribute($crawler, $selector);
            if ($image && !$this->isPlaceholderImage($image)) {
                return html_entity_decode(trim($image), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        // 2. PRIORIDAD MEDIA: Meta tags OpenGraph y Twitter
        $metaImage = $this->extractAttribute($crawler, [
            'meta[property="og:image"]',
            'meta[property="og:image:url"]',
            'meta[name="twitter:image"]',
            'meta[itemprop="image"]',
        ], 'content');

        if ($metaImage && !$this->isPlaceholderImage($metaImage)) {
            return html_entity_decode(trim($metaImage), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        // 3. PRIORIDAD BAJA: Primera imagen genérica válida
        $genericSelectors = [
            'img[itemprop="image"]',
            'img[data-src]',
            'img[data-lazy-src]',
            'img[data-original]',
            'img[src]'
        ];

        foreach ($genericSelectors as $selector) {
            $image = $this->extractImageAttribute($crawler, $selector);
            if ($image && !$this->isPlaceholderImage($image)) {
                return html_entity_decode(trim($image), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        return null;
    }

    private function extractImageAttribute(Crawler $crawler, string $selector): ?string
    {
        $node = $crawler->filter($selector);
        if (! $node->count()) {
            return null;
        }

        // Leer imágenes dinámicas de Amazon (alta resolución)
        $dynamicImageAttr = $node->first()->attr('data-a-dynamic-image');
        if ($dynamicImageAttr) {
            $decoded = json_decode($dynamicImageAttr, true);
            if (is_array($decoded) && count($decoded) > 0) {
                $firstUrl = array_key_first($decoded);
                if ($firstUrl && !$this->isPlaceholderImage($firstUrl)) {
                    return $firstUrl;
                }
            }
        }

        foreach (['data-zoom', 'data-full', 'data-image', 'data-src', 'data-lazy-src', 'data-original', 'src'] as $attribute) {
            $value = $node->first()->attr($attribute);
            if ($value && ! $this->isPlaceholderImage($value)) {
                return $value;
            }
        }

        $srcset = $node->first()->attr('srcset');
        if ($srcset) {
            $candidates = array_map('trim', explode(',', $srcset));
            $largest = trim((string) end($candidates));
            $largest = preg_replace('/\s+\S+$/', '', $largest);
            if ($largest && ! $this->isPlaceholderImage($largest)) {
                return $largest;
            }
        }
        return null;
    }

    private function isPlaceholderImage(string $image): bool
    {
        return (bool) preg_match(
            '/(placeholder|place-holder|spacer|transparent|blank|loading|lazyload|data:image\/gif|logo|sprite|favicon|banner|sponsor|store_logo|brand-logo)/i',
            $image
        );
    }

    private function extractStructuredProduct(Crawler $crawler): array
    {
        $product = [
            'title' => null,
            'image' => null,
            'price' => null,
            'original_price' => null,
        ];

        foreach ($crawler->filter('script[type="application/ld+json"]') as $script) {
            $json = json_decode($script->textContent, true);
            if (! is_array($json)) continue;

            $items = isset($json['@graph']) && is_array($json['@graph']) ? $json['@graph'] : [$json];

            foreach ($items as $item) {
                if (! is_array($item) || ! $this->isProductSchema($item)) continue;

                $offers = $item['offers'] ?? [];
                $offer = isset($offers[0]) && is_array($offers[0]) ? $offers[0] : $offers;
                $product['title'] ??= is_string($item['name'] ?? null) ? trim($item['name']) : null;
                $product['image'] ??= $this->extractStructuredImage($item['image'] ?? null);
                $product['price'] ??= $this->parsePrice($offer['price'] ?? null);
                $product['original_price'] ??= $this->parsePrice($item['priceSpecification']['price'] ?? null);
            }
        }
        return $product;
    }

    private function extractStructuredImage(mixed $image): ?string
    {
        if (is_string($image)) return trim($image);
        if (! is_array($image)) return null;
        if (isset($image['url']) && is_string($image['url'])) return trim($image['url']);

        foreach ($image as $candidate) {
            $resolved = $this->extractStructuredImage($candidate);
            if ($resolved) return $resolved;
        }
        return null;
    }

    private function resolveUrl(?string $image, string $pageUrl): ?string
    {
        if (! $image) return null;
        $image = trim($image);

        if (str_starts_with($image, '//')) {
            $scheme = parse_url($pageUrl, PHP_URL_SCHEME) ?: 'https';
            return $scheme . ':' . $image;
        }
        if (preg_match('/^https?:\/\//i', $image) || str_starts_with($image, 'data:image/')) {
            return $image;
        }

        $parts = parse_url($pageUrl);
        if (! isset($parts['scheme'], $parts['host'])) return null;

        $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        if (str_starts_with($image, '/')) return $origin . $image;

        $path = $parts['path'] ?? '/';
        $directory = rtrim(str_replace('\\', '/', dirname($path)), '/');
        return $origin . ($directory ? $directory . '/' : '/') . $image;
    }

    private function isProductSchema(array $item): bool
    {
        $type = $item['@type'] ?? null;
        return $type === 'Product' || $type === 'ProductGroup' || (is_array($type) && (in_array('Product', $type, true) || in_array('ProductGroup', $type, true)));
    }

    private function parsePrice(mixed $value): ?float
    {
        if (is_array($value)) $value = $value['price'] ?? null;
        if (! is_string($value) && ! is_numeric($value)) return null;

        $normalized = preg_replace('/[^0-9.,]/', '', (string) $value);
        if (! $normalized) return null;

        if (str_contains($normalized, ',') && str_contains($normalized, '.')) {
            $lastComma = strrpos($normalized, ',');
            $lastDot = strrpos($normalized, '.');
            if ($lastComma > $lastDot) {
                $normalized = str_replace('.', '', $normalized);
                $normalized = str_replace(',', '.', $normalized);
            } else {
                $normalized = str_replace(',', '', $normalized);
            }
        } elseif (str_contains($normalized, ',')) {
            $lastComma = strrpos($normalized, ',');
            $digitsAfterSeparator = strlen($normalized) - $lastComma - 1;
            $normalized = $digitsAfterSeparator === 3 ? str_replace(',', '', $normalized) : str_replace(',', '.', $normalized);
        }

        $price = (float) $normalized;
        return $price > 0 ? $price : null;
    }
}
