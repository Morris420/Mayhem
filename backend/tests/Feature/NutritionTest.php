<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\FoodSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NutritionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-22 20:00:00'));
        Cache::flush();
        $this->user = User::factory()->create();
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function skyr(): array
    {
        return ['code' => '123', 'name' => 'Skyr', 'brand' => 'Arla', 'kcal_100g' => 63, 'protein_100g' => 11, 'serving_g' => 150];
    }

    private function add(array $food, float $grams, ?string $date = null)
    {
        return $this->postJson('/api/nutrition/entries', ['food' => $food, 'grams' => $grams] + ($date ? ['date' => $date] : []));
    }

    public function test_default_goals_and_empty_day(): void
    {
        $this->getJson('/api/nutrition')->assertOk()
            ->assertJsonPath('goals.kcal', 2500)->assertJsonPath('goals.protein', 150)
            ->assertJsonPath('totals.kcal', 0)->assertJsonPath('status.day_ok', false)
            ->assertJsonCount(7, 'week')->assertJsonPath('streak', 0);
    }

    public function test_entries_are_computed_on_the_server_and_totals_add_up(): void
    {
        $res = $this->add($this->skyr(), 200)->assertCreated();
        $res->assertJsonPath('entries.0.kcal', 126)->assertJsonPath('entries.0.protein', 22)
            ->assertJsonPath('entries.0.name', 'Skyr (Arla)');

        $this->add(['name' => 'Rice', 'kcal_100g' => 130, 'protein_100g' => 2.7], 150);
        $res = $this->getJson('/api/nutrition');
        $res->assertJsonPath('totals.kcal', 321)->assertJsonCount(2, 'entries');
        $this->assertEquals(26.1, $res->json('totals.protein'));
    }

    public function test_goal_status_under_on_over_and_protein(): void
    {
        $this->putJson('/api/nutrition/goals', ['kcal' => 2000, 'protein' => 100])->assertOk();

        $free = ['name' => 'Fuel', 'kcal_100g' => 100, 'protein_100g' => 10];
        $this->add($free, 1000)->assertJsonPath('status.kcal.state', 'under')->assertJsonPath('status.protein.reached', true)->assertJsonPath('status.day_ok', false);
        $this->add($free, 900)->assertJsonPath('status.kcal.state', 'on')->assertJsonPath('status.day_ok', true);   // 1900 kcal, 190 g
        $this->add($free, 500)->assertJsonPath('status.kcal.state', 'over');                                          // 2400 kcal > 2200
    }

    public function test_editing_grams_recomputes_and_deleting_removes(): void
    {
        $id = $this->add($this->skyr(), 100)->json('entries.0.id');
        $this->putJson("/api/nutrition/entries/$id", ['grams' => 300])->assertOk()->assertJsonPath('entries.0.kcal', 189);
        $this->deleteJson("/api/nutrition/entries/$id")->assertOk()->assertJsonCount(0, 'entries');
    }

    public function test_same_barcode_reuses_one_food_and_recent_foods_listed(): void
    {
        $this->add($this->skyr(), 100);
        $res = $this->add($this->skyr() + [], 150);
        $this->assertSame(1, $this->user->foods()->count());
        $res->assertJsonCount(1, 'recent_foods');

        $foodId = $res->json('recent_foods.0.id');
        $this->postJson('/api/nutrition/entries', ['food_id' => $foodId, 'grams' => 50])->assertCreated()->assertJsonCount(3, 'entries');
    }

    public function test_past_days_streak_and_week(): void
    {
        $this->putJson('/api/nutrition/goals', ['kcal' => 2000, 'protein' => 100]);
        $good = ['name' => 'Day food', 'kcal_100g' => 100, 'protein_100g' => 10];
        foreach (['2026-11-21', '2026-11-20', '2026-11-19'] as $d) {
            $this->add($good, 2000, $d)->assertCreated();    // 2000 kcal, 200 g protein
        }
        $this->add($good, 800, '2026-11-18');                  // under: breaks the streak

        $res = $this->getJson('/api/nutrition');               // today empty, yesterday counts
        $res->assertJsonPath('streak', 3);
        // week runs 16th..22nd (index 6 = today)
        foreach ([3, 4, 5] as $i) {
            $this->assertTrue($res->json("week.$i.day_ok"), "day index $i should be ok");   // 19th, 20th, 21st
        }
        $this->assertFalse($res->json('week.2.day_ok'));       // 18th: only 800 kcal
        $this->assertFalse($res->json('week.6.day_ok'));       // today: nothing logged yet
    }

    public function test_cannot_log_in_the_future_or_touch_others(): void
    {
        $this->add($this->skyr(), 100, '2026-11-25')->assertUnprocessable();
        $this->add($this->skyr(), 0)->assertUnprocessable();
        $this->add(['name' => 'x', 'kcal_100g' => 5000, 'protein_100g' => 1], 100)->assertUnprocessable();

        $other = User::factory()->create();
        $theirs = $other->mealEntries()->create(['date' => '2026-11-22', 'name' => 'secret', 'grams' => 100, 'kcal_100g' => 100, 'protein_100g' => 1, 'kcal' => 100, 'protein' => 1]);
        $this->putJson("/api/nutrition/entries/{$theirs->id}", ['grams' => 5])->assertNotFound();
        $this->deleteJson("/api/nutrition/entries/{$theirs->id}")->assertNotFound();
    }

    public function test_goal_validation(): void
    {
        $this->putJson('/api/nutrition/goals', ['kcal' => 100, 'protein' => 5])->assertUnprocessable()->assertJsonValidationErrors(['kcal', 'protein']);
    }

    // --- Open Food Facts ----------------------------------------------------

    public function test_search_with_the_current_search_service_shape(): void
    {
        Http::fake([
            'search.openfoodfacts.org/*' => Http::response(['hits' => [
                ['code' => '1', 'product_name' => 'Skyr Natural', 'brands' => ['Arla', 'Other'], 'serving_size' => '150 g',
                    'nutriments' => ['energy-kcal_100g' => 63, 'proteins_100g' => 11]],
                ['code' => '2', 'product_name' => 'Kilojoule only', 'brands' => 'X, Y', 'nutriments' => ['energy_100g' => 418.4, 'proteins_100g' => 1]],
                ['code' => '3', 'product_name' => '', 'nutriments' => ['energy-kcal_100g' => 10]],           // no name: skipped
                ['code' => '4', 'product_name' => 'No energy', 'nutriments' => ['proteins_100g' => 5]],        // no kcal: skipped
            ]]),
        ]);

        $res = $this->getJson('/api/nutrition/search?q=skyr')->assertOk();
        $res->assertJsonCount(2, 'results')->assertJsonPath('results.0.brand', 'Arla')->assertJsonPath('results.0.serving_g', 150);
        $this->assertEqualsWithDelta(100, $res->json('results.1.kcal_100g'), 0.1);
        $this->assertSame('X', $res->json('results.1.brand'));
    }

    public function test_search_falls_back_to_the_legacy_service(): void
    {
        Http::fake([
            'search.openfoodfacts.org/*' => Http::response('boom', 500),
            'world.openfoodfacts.org/*' => Http::response(['products' => [
                ['code' => '9', 'product_name' => 'Legacy oats', 'brands' => 'Quaker', 'serving_quantity' => 40,
                    'nutriments' => ['energy-kcal_100g' => 370, 'proteins_100g' => 13]],
            ]]),
        ]);

        $this->getJson('/api/nutrition/search?q=oats')->assertOk()->assertJsonPath('results.0.name', 'Legacy oats')->assertJsonPath('results.0.serving_g', 40);
    }

    public function test_search_reports_unreachable_database_and_does_not_cache_failures(): void
    {
        $up = false;
        Http::fake(function () use (&$up) { // by reference, so flipping $up below takes effect
            return $up
                ? Http::response(['hits' => [['code' => '1', 'product_name' => 'Skyr', 'nutriments' => ['energy-kcal_100g' => 60]]]])
                : Http::response('down', 503);
        });

        $this->getJson('/api/nutrition/search?q=skyr')->assertStatus(502)->assertJsonPath('message', fn ($m) => str_contains($m, 'by hand'));

        $up = true; // the service recovers: the earlier failure must not have been cached
        $this->getJson('/api/nutrition/search?q=skyr')->assertOk()->assertJsonCount(1, 'results');
    }

    public function test_search_validation_and_caching(): void
    {
        $this->getJson('/api/nutrition/search?q=a')->assertUnprocessable();

        Http::fake(['search.openfoodfacts.org/*' => Http::response(['hits' => [['code' => '1', 'product_name' => 'Skyr', 'nutriments' => ['energy-kcal_100g' => 60]]]])]);
        $this->getJson('/api/nutrition/search?q=skyr')->assertOk();
        $this->getJson('/api/nutrition/search?q=SKYR')->assertOk();
        Http::assertSentCount(1); // second one came from the cache
    }
}
