<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Looks foods up in Open Food Facts (free, no API key).
 *
 * Open Food Facts is the data source; the request goes through *our* server so the browser
 * never talks to it directly (no CORS trouble, we can cache, and we set a proper User-Agent
 * as they ask). We try their current search service first and fall back to the older one,
 * and understand both response shapes.
 */
class FoodSearch
{
    private const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';

    public function search(string $query): array
    {
        $query = trim($query);

        // Same search within a day is served from cache (be polite to a free service).
        return Cache::remember('off-search:'.md5(mb_strtolower($query)), now()->addDay(), function () use ($query) {
            $errors = [];
            foreach (['searchALicious', 'legacySearch'] as $provider) {
                try {
                    $results = $this->$provider($query);
                    if ($results !== []) {
                        return $results;
                    }
                } catch (\Throwable $e) {
                    $errors[] = $provider.': '.$e->getMessage();
                }
            }

            // Both failed (as opposed to "found nothing"): do not cache the failure.
            if (count($errors) === 2) {
                Log::warning('Open Food Facts lookup failed', $errors);
                throw new RuntimeException('Food database unreachable');
            }

            return [];
        });
    }

    private function http()
    {
        return Http::withHeaders(['User-Agent' => 'Mayhem/1.0 (personal productivity dashboard)'])
            ->acceptJson()->timeout(8)->retry(1, 300, throw: false);
    }

    private function searchALicious(string $q): array
    {
        $res = $this->http()->get('https://search.openfoodfacts.org/search', [
            'q' => $q, 'fields' => self::FIELDS, 'page_size' => 20,
        ])->throw();

        return $this->normalizeAll($res->json('hits', []));
    }

    private function legacySearch(string $q): array
    {
        $res = $this->http()->get('https://world.openfoodfacts.org/cgi/search.pl', [
            'search_terms' => $q, 'search_simple' => 1, 'action' => 'process', 'json' => 1,
            'page_size' => 20, 'fields' => self::FIELDS,
        ])->throw();

        return $this->normalizeAll($res->json('products', []));
    }

    private function normalizeAll(array $items): array
    {
        return collect($items)->map(fn ($p) => $this->normalize($p))->filter()->unique('code')->values()->take(15)->all();
    }

    /** Turns one Open Food Facts product into the few numbers we need (per 100 g). */
    public function normalize(array $p): ?array
    {
        $name = trim((string) ($p['product_name'] ?? $p['product_name_en'] ?? ''));
        $n = $p['nutriments'] ?? [];

        $kcal = $n['energy-kcal_100g'] ?? $n['energy-kcal'] ?? null;
        if ($kcal === null && isset($n['energy_100g'])) {
            $kcal = $n['energy_100g'] / 4.184; // only kilojoules known
        }
        $protein = $n['proteins_100g'] ?? $n['proteins'] ?? null;

        if ($name === '' || ! is_numeric($kcal) || $kcal < 0 || $kcal > 900) {
            return null; // not usable: skip silently
        }

        $brand = $p['brands'] ?? null;
        if (is_array($brand)) {
            $brand = $brand[0] ?? null;
        }
        $brand = $brand ? trim(explode(',', (string) $brand)[0]) : null;

        $serving = null;
        if (isset($p['serving_quantity']) && is_numeric($p['serving_quantity']) && $p['serving_quantity'] > 0) {
            $serving = (float) $p['serving_quantity'];
        } elseif (! empty($p['serving_size']) && preg_match('/([\d.,]+)\s*g\b/i', (string) $p['serving_size'], $m)) {
            $serving = (float) str_replace(',', '.', $m[1]);
        }

        return [
            'code' => isset($p['code']) ? (string) $p['code'] : null,
            'name' => mb_substr($name, 0, 160),
            'brand' => $brand ? mb_substr($brand, 0, 120) : null,
            'kcal_100g' => round((float) $kcal, 1),
            'protein_100g' => is_numeric($protein) ? round((float) $protein, 1) : 0.0,
            'serving_g' => $serving && $serving <= 2000 ? $serving : null,
        ];
    }
}
