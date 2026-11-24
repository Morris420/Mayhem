<?php

namespace Tests\Feature;

use App\Models\BriefcaseItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BriefcaseTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->user = User::factory()->create();
        $this->actingAs($this->user)->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    private function upload(string $name = 'Finances 2026.xlsx', int $kb = 40, ?int $parent = null)
    {
        return $this->post('/api/briefcase/files', ['files' => [UploadedFile::fake()->create($name, $kb)]] + ($parent ? ['parent_id' => $parent] : []), ['Accept' => 'application/json']);
    }

    public function test_starts_empty(): void
    {
        $this->getJson('/api/briefcase')->assertOk()->assertJsonCount(0, 'items')->assertJsonPath('usage.bytes', 0)->assertJsonPath('folder', null);
    }

    public function test_upload_stores_privately_and_lists_the_file(): void
    {
        $res = $this->upload()->assertCreated();
        $res->assertJsonPath('items.0.name', 'Finances 2026')->assertJsonPath('items.0.extension', 'xlsx')->assertJsonPath('items.0.kind', 'file');

        $item = BriefcaseItem::first();
        Storage::disk('local')->assertExists($item->path);
        $this->assertStringStartsWith("briefcase/{$this->user->id}/", $item->path);
        $this->assertStringNotContainsString('Finances', $item->path); // random name on disk
        $this->assertGreaterThan(0, $res->json('usage.bytes'));
    }

    public function test_excel_downloads_but_pdf_and_images_open_inline(): void
    {
        $this->upload('budget.xlsx');
        $this->upload('statement.pdf');
        [$xlsx, $pdf] = BriefcaseItem::orderBy('id')->get();

        $r = $this->get("/api/briefcase/{$xlsx->id}/file")->assertOk();
        $this->assertStringContainsString('attachment', $r->headers->get('Content-Disposition'));
        $this->assertStringContainsString('budget.xlsx', $r->headers->get('Content-Disposition'));
        $this->assertSame('nosniff', $r->headers->get('X-Content-Type-Options'));

        $r = $this->get("/api/briefcase/{$pdf->id}/file")->assertOk();
        $this->assertStringContainsString('inline', $r->headers->get('Content-Disposition'));
        $this->assertSame('application/pdf', $r->headers->get('Content-Type'));

        $r = $this->get("/api/briefcase/{$pdf->id}/file?download=1")->assertOk();
        $this->assertStringContainsString('attachment', $r->headers->get('Content-Disposition'));
    }

    public function test_dangerous_types_are_refused(): void
    {
        foreach (['shell.php', 'page.html', 'drawing.svg', 'run.exe', 'noext'] as $name) {
            $this->upload($name)->assertStatus(422);
        }
        $this->assertSame(0, BriefcaseItem::count());
    }

    public function test_size_limit_and_quota(): void
    {
        $this->upload('big.xlsx', BriefcaseItem::MAX_KB + 1)->assertStatus(422);

        BriefcaseItem::create(['user_id' => $this->user->id, 'kind' => 'file', 'name' => 'old', 'path' => 'x', 'extension' => 'zip', 'size' => BriefcaseItem::QUOTA_BYTES - 1000]);
        $this->upload('one-more.xlsx', 10)->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'full'));
    }

    public function test_folders_nest_and_breadcrumbs_follow(): void
    {
        $a = $this->postJson('/api/briefcase/folders', ['name' => 'Finance'])->assertCreated()->json('items.0.id');
        $b = $this->postJson('/api/briefcase/folders', ['name' => '2026', 'parent_id' => $a])->assertCreated()->json('items.0.id');
        $this->upload('jan.xlsx', 10, $b)->assertCreated();

        $res = $this->getJson("/api/briefcase?folder=$b")->assertOk();
        $this->assertSame(['Finance', '2026'], collect($res->json('breadcrumbs'))->pluck('name')->all());
        $res->assertJsonPath('items.0.name', 'jan');

        $this->assertSame(1, $this->getJson('/api/briefcase')->json('items.0.count')); // folder shows how many items inside
    }

    public function test_links_open_online_documents(): void
    {
        $this->postJson('/api/briefcase/links', ['name' => 'Budget (Sheets)', 'url' => 'https://docs.google.com/spreadsheets/d/abc/edit'])
            ->assertCreated()->assertJsonPath('items.0.kind', 'link')->assertJsonPath('items.0.url', 'https://docs.google.com/spreadsheets/d/abc/edit');
        $this->postJson('/api/briefcase/links', ['name' => 'evil', 'url' => 'javascript:alert(1)'])->assertStatus(422);
        $this->postJson('/api/briefcase/links', ['name' => 'evil', 'url' => 'ftp://x.com/a'])->assertStatus(422);
    }

    public function test_rename_and_move_but_never_into_itself(): void
    {
        $a = $this->postJson('/api/briefcase/folders', ['name' => 'A'])->json('items.0.id');
        $b = $this->postJson('/api/briefcase/folders', ['name' => 'B', 'parent_id' => $a])->json('items.0.id');
        $this->upload('x.csv');
        $file = BriefcaseItem::where('kind', 'file')->first();

        $this->putJson("/api/briefcase/{$file->id}", ['name' => 'Income'])->assertOk();
        $this->assertSame('Income', $file->fresh()->name);
        $this->putJson("/api/briefcase/{$file->id}", ['parent_id' => $b])->assertOk();
        $this->assertSame($b, $file->fresh()->parent_id);
        $this->putJson("/api/briefcase/{$file->id}", ['parent_id' => null])->assertOk();
        $this->assertNull($file->fresh()->parent_id);

        $this->putJson("/api/briefcase/$a", ['parent_id' => $a])->assertStatus(422);
        $this->putJson("/api/briefcase/$a", ['parent_id' => $b])->assertStatus(422); // B is inside A
        $this->putJson("/api/briefcase/{$file->id}", ['parent_id' => $file->id])->assertStatus(422); // not a folder
    }

    public function test_names_are_cleaned(): void
    {
        $id = $this->postJson('/api/briefcase/folders', ['name' => '../../etc/passwd'])->assertCreated()->json('items.0.id');
        $this->assertStringNotContainsString('/', BriefcaseItem::find($id)->name);
    }

    public function test_replace_keeps_the_item_and_bumps_the_version(): void
    {
        $this->upload('budget.xlsx', 10);
        $item = BriefcaseItem::first();
        $oldPath = $item->path;

        $this->post("/api/briefcase/{$item->id}/replace", ['file' => UploadedFile::fake()->create('budget-new.xlsx', 30)], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('items.0.version', 2)->assertJsonPath('items.0.name', 'budget');

        Storage::disk('local')->assertMissing($oldPath);
        Storage::disk('local')->assertExists($item->fresh()->path);
        $this->assertSame(1, BriefcaseItem::count());
    }

    public function test_deleting_a_folder_deletes_its_files_from_disk(): void
    {
        $f = $this->postJson('/api/briefcase/folders', ['name' => 'Tax'])->json('items.0.id');
        $this->upload('a.xlsx', 10, $f);
        $this->upload('b.pdf', 10, $f);
        $paths = BriefcaseItem::where('kind', 'file')->pluck('path');
        $this->assertCount(2, $paths);

        $this->deleteJson("/api/briefcase/$f")->assertOk()->assertJsonCount(0, 'items');
        $this->assertSame(0, BriefcaseItem::count());
        foreach ($paths as $p) {
            Storage::disk('local')->assertMissing($p);
        }
    }

    public function test_other_users_cannot_see_or_touch_your_files(): void
    {
        $this->upload('secret.xlsx');
        $item = BriefcaseItem::first();
        $folder = $this->postJson('/api/briefcase/folders', ['name' => 'Mine'])->json('items.0.id');

        $other = User::factory()->create();
        $this->actingAs($other);
        $this->getJson('/api/briefcase')->assertJsonCount(0, 'items');
        $this->get("/api/briefcase/{$item->id}/file")->assertNotFound();
        $this->putJson("/api/briefcase/{$item->id}", ['name' => 'x'])->assertNotFound();
        $this->deleteJson("/api/briefcase/{$item->id}")->assertNotFound();
        $this->postJson('/api/briefcase/folders', ['name' => 'sneaky', 'parent_id' => $folder])->assertStatus(422);
        $this->getJson("/api/briefcase?folder=$folder")->assertNotFound();
    }

    public function test_office_apps_get_a_signed_short_lived_address(): void
    {
        $this->upload('Budget 2026.xlsx');
        $item = BriefcaseItem::first();

        $url = $this->getJson("/api/briefcase/{$item->id}/open-link")->assertOk()->json('url');
        $this->assertStringEndsWith('.xlsx', parse_url($url, PHP_URL_PATH));
        $this->assertStringContainsString('signature=', $url);

        // the Office app has no login: the signature is the key
        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->get($url)->assertOk();
        $this->get(preg_replace('/signature=[^&]+/', 'signature=nope', $url))->assertStatus(403);
        $this->get("/api/briefcase/open/{$item->id}/x.xlsx")->assertStatus(403);

        $this->travel(11)->minutes();
        $this->get($url)->assertStatus(403); // expired
    }

    public function test_open_link_is_only_for_your_own_files(): void
    {
        $this->upload('secret.xlsx');
        $item = BriefcaseItem::first();
        $this->actingAs(User::factory()->create())->getJson("/api/briefcase/{$item->id}/open-link")->assertNotFound();
    }

    public function test_login_is_required(): void
    {
        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->withoutMiddleware(); // keep it simple: just confirm the route group is behind auth
        $this->assertTrue(collect(app('router')->getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri, 'api/briefcase') && ! str_starts_with($r->uri, 'api/briefcase/open/'))->every(fn ($r) => in_array('auth:sanctum', $r->gatherMiddleware())));
    }
}
