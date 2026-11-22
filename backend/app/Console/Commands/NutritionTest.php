<?php

namespace App\Console\Commands;

use App\Support\FoodSearch;
use Illuminate\Console\Command;

class NutritionTest extends Command
{
    protected $signature = 'nutrition:test {query=skyr : What to search for}';

    protected $description = 'Check that the Open Food Facts food search works from this machine';

    public function handle(FoodSearch $search): int
    {
        $this->info("Searching Open Food Facts for \"{$this->argument('query')}\"…");

        try {
            $results = $search->search($this->argument('query'));
        } catch (\Throwable $e) {
            $this->error('Could not reach Open Food Facts: '.$e->getMessage());
            $this->line('Check your internet connection, and see storage/logs/laravel.log for the detailed reasons.');

            return self::FAILURE;
        }

        if ($results === []) {
            $this->warn('Connected, but nothing usable came back. Try another search word.');

            return self::SUCCESS;
        }

        $this->table(['Name', 'Brand', 'kcal/100g', 'protein/100g', 'serving g'], array_map(
            fn ($r) => [$r['name'], $r['brand'], $r['kcal_100g'], $r['protein_100g'], $r['serving_g']], array_slice($results, 0, 8),
        ));
        $this->info(count($results).' results. The food search works.');

        return self::SUCCESS;
    }
}
