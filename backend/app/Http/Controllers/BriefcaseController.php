<?php

namespace App\Http\Controllers;

use App\Models\BriefcaseItem;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BriefcaseController extends Controller
{
    private function disk()
    {
        return Storage::disk('local'); // storage/app/private: not reachable by URL, only through this controller
    }

    /** GET /api/briefcase?folder=12 */
    public function index(Request $request): JsonResponse
    {
        $folder = $request->integer('folder') ?: null;
        if ($folder) {
            $request->user()->briefcaseItems()->where('kind', 'folder')->findOrFail($folder);
        }

        return response()->json($this->payload($request->user(), $folder));
    }

    public function folder(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['name' => ['required', 'string', 'max:80'], 'parent_id' => $this->parentRule($user)]);

        $user->briefcaseItems()->create(['kind' => 'folder', 'name' => $this->cleanName($data['name']), 'parent_id' => $data['parent_id'] ?? null]);

        return response()->json($this->payload($user, $data['parent_id'] ?? null), 201);
    }

    public function link(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'url' => ['required', 'url:http,https', 'max:500'],
            'parent_id' => $this->parentRule($user),
        ]);

        $user->briefcaseItems()->create(['kind' => 'link', 'name' => $this->cleanName($data['name']), 'url' => $data['url'], 'parent_id' => $data['parent_id'] ?? null]);

        return response()->json($this->payload($user, $data['parent_id'] ?? null), 201);
    }

    /** Upload one or more files into a folder. */
    public function upload(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:20'],
            'files.*' => ['file', 'max:'.BriefcaseItem::MAX_KB, 'extensions:'.implode(',', array_keys(BriefcaseItem::TYPES))],
            'parent_id' => $this->parentRule($user),
        ], [
            'files.*.max' => 'Each file can be at most '.(BriefcaseItem::MAX_KB / 1024).' MB.',
            'files.*.extensions' => 'That file type is not allowed. Spreadsheets, documents, PDFs, images and zips are.',
            'files.*.uploaded' => 'The file could not be uploaded. It may be bigger than your server allows (check upload_max_filesize in php.ini).',
        ]);

        $incoming = $request->file('files');
        if ($user->briefcaseItems()->sum('size') + collect($incoming)->sum(fn (UploadedFile $f) => $f->getSize()) > BriefcaseItem::QUOTA_BYTES) {
            return response()->json(['message' => 'Your Briefcase is full ('.(BriefcaseItem::QUOTA_BYTES / 1048576).' MB). Delete something first.'], 422);
        }

        foreach ($incoming as $file) {
            $this->store($user, $file, $data['parent_id'] ?? null);
        }

        return response()->json($this->payload($user, $data['parent_id'] ?? null), 201);
    }

    /** Rename and/or move. */
    public function update(Request $request, int $itemId): JsonResponse
    {
        $user = $request->user();
        $item = $user->briefcaseItems()->findOrFail($itemId);
        $data = $request->validate(['name' => ['sometimes', 'required', 'string', 'max:80'], 'parent_id' => ['sometimes', ...$this->parentRule($user)]]);

        if (array_key_exists('parent_id', $data) && $data['parent_id'] !== null) {
            abort_if($item->isFolder() && $this->isInside((int) $data['parent_id'], $item->id), 422, 'A folder cannot go inside itself.');
        }
        if (isset($data['name'])) {
            $data['name'] = $this->cleanName($data['name']);
        }
        $item->update($data);

        return response()->json($this->payload($user, $item->parent_id));
    }

    /** Swap a file for a newer version (same place, same name). */
    public function replace(Request $request, int $itemId): JsonResponse
    {
        $user = $request->user();
        $item = $user->briefcaseItems()->where('kind', 'file')->findOrFail($itemId);
        $request->validate(['file' => ['required', 'file', 'max:'.BriefcaseItem::MAX_KB, 'extensions:'.implode(',', array_keys(BriefcaseItem::TYPES))]]);

        /** @var UploadedFile $file */
        $file = $request->file('file');
        if ($user->briefcaseItems()->sum('size') - $item->size + $file->getSize() > BriefcaseItem::QUOTA_BYTES) {
            return response()->json(['message' => 'Your Briefcase is full. Delete something first.'], 422);
        }

        $old = $item->path;
        $ext = strtolower($file->getClientOriginalExtension());
        $path = $file->storeAs("briefcase/{$user->id}", Str::uuid().'.'.$ext, 'local');
        $item->update(['path' => $path, 'extension' => $ext, 'size' => $file->getSize(), 'version' => $item->version + 1]);
        if ($old) {
            $this->disk()->delete($old);
        }

        return response()->json($this->payload($user, $item->parent_id));
    }

    public function destroy(Request $request, int $itemId): JsonResponse
    {
        $user = $request->user();
        $item = $user->briefcaseItems()->findOrFail($itemId);
        $parent = $item->parent_id;

        $this->deleteTree($user, $item);

        return response()->json($this->payload($user, $parent));
    }

    /** Opens in a browser tab when the browser can show it, otherwise downloads (and your computer opens Excel). */
    public function file(Request $request, int $itemId): StreamedResponse
    {
        $item = $request->user()->briefcaseItems()->where('kind', 'file')->findOrFail($itemId);
        abort_unless($item->path && $this->disk()->exists($item->path), 404, 'The file is missing from storage.');

        $inline = ! $request->boolean('download') && in_array($item->extension, BriefcaseItem::INLINE, true);
        $type = BriefcaseItem::TYPES[$item->extension] ?? 'application/octet-stream';
        $filename = $this->downloadName($item);

        return $this->disk()->response($item->path, $filename, [
            'Content-Type' => $type.(str_starts_with($type, 'text/') ? '; charset=UTF-8' : ''),
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
            'Cache-Control' => 'private, no-store',
        ], $inline ? 'inline' : 'attachment');
    }

    /**
     * A short-lived address your Office app can fetch directly (it has no browser login).
     * Used by "Open in Excel/Word": the app opens it through ms-excel:ofe|u|<this address>.
     */
    public function openLink(Request $request, int $itemId): JsonResponse
    {
        $item = $request->user()->briefcaseItems()->where('kind', 'file')->findOrFail($itemId);

        return response()->json(['url' => URL::temporarySignedRoute('briefcase.open', now()->addMinutes(10), ['item' => $item->id, 'filename' => $this->downloadName($item, true)])]);
    }

    /** Reached only with a valid signature (see the `signed` middleware in routes). */
    public function openSigned(int $itemId): StreamedResponse
    {
        $item = BriefcaseItem::where('kind', 'file')->findOrFail($itemId);
        abort_unless($item->path && $this->disk()->exists($item->path), 404);

        return $this->disk()->response($item->path, $this->downloadName($item), [
            'Content-Type' => BriefcaseItem::TYPES[$item->extension] ?? 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ], 'attachment');
    }

    // ---------------------------------------------------------------------

    private function store(User $user, UploadedFile $file, ?int $parent): void
    {
        $ext = strtolower($file->getClientOriginalExtension());
        $path = $file->storeAs("briefcase/{$user->id}", Str::uuid().'.'.$ext, 'local');

        $user->briefcaseItems()->create([
            'kind' => 'file', 'parent_id' => $parent, 'path' => $path, 'extension' => $ext, 'size' => $file->getSize(),
            'name' => $this->cleanName(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME)),
        ]);
    }

    private function deleteTree(User $user, BriefcaseItem $item): void
    {
        if ($item->isFolder()) {
            $user->briefcaseItems()->where('parent_id', $item->id)->get()->each(fn ($c) => $this->deleteTree($user, $c));
        }
        if ($item->path) {
            $this->disk()->delete($item->path);
        }
        $item->delete();
    }

    /** Is $folderId the same as, or somewhere below, $ancestorId? */
    private function isInside(int $folderId, int $ancestorId): bool
    {
        for ($i = 0; $i < 50 && $folderId; $i++) {
            if ($folderId === $ancestorId) {
                return true;
            }
            $folderId = (int) BriefcaseItem::whereKey($folderId)->value('parent_id');
        }

        return false;
    }

    private function parentRule(User $user): array
    {
        return ['nullable', 'integer', Rule::exists('briefcase_items', 'id')->where('user_id', $user->id)->where('kind', 'folder')];
    }

    private function cleanName(string $name): string
    {
        $name = trim(preg_replace('/[\x00-\x1f\x7f\/\\\\]+/u', ' ', $name));

        return $name === '' ? 'Untitled' : Str::limit($name, 120, '');
    }

    private function downloadName(BriefcaseItem $item, bool $forUrl = false): string
    {
        $base = trim(preg_replace('/[^\p{L}\p{N} ._()\-]+/u', '_', $item->name)) ?: 'file';
        if ($forUrl) {
            $base = trim(preg_replace('/[^A-Za-z0-9._-]+/', '_', $base), '_') ?: 'file'; // plain characters only, so the URL stays tidy
        }

        return $base.'.'.$item->extension;
    }

    private function payload(User $user, ?int $folderId): array
    {
        $items = $user->briefcaseItems()->where('parent_id', $folderId)->get()
            ->sortBy([fn ($a, $b) => ($a->kind === 'folder' ? 0 : 1) <=> ($b->kind === 'folder' ? 0 : 1), fn ($a, $b) => strcasecmp($a->name, $b->name)])
            ->values();

        $counts = $user->briefcaseItems()->whereIn('parent_id', $items->where('kind', 'folder')->pluck('id'))
            ->selectRaw('parent_id, count(*) as n')->groupBy('parent_id')->pluck('n', 'parent_id');

        $crumbs = [];
        $cursor = $folderId;
        for ($i = 0; $i < 50 && $cursor; $i++) {
            $f = $user->briefcaseItems()->find($cursor);
            if (! $f) {
                break;
            }
            array_unshift($crumbs, ['id' => $f->id, 'name' => $f->name]);
            $cursor = $f->parent_id;
        }

        return [
            'folder' => $folderId ? end($crumbs) : null,
            'breadcrumbs' => $crumbs,
            'items' => $items->map(fn (BriefcaseItem $i) => [
                'id' => $i->id, 'kind' => $i->kind, 'name' => $i->name, 'extension' => $i->extension,
                'size' => (int) $i->size, 'url' => $i->url, 'version' => $i->version,
                'count' => $i->isFolder() ? (int) ($counts[$i->id] ?? 0) : null,
                'updated_at' => $i->updated_at->toIso8601String(),
                'inline' => $i->kind === 'file' && in_array($i->extension, BriefcaseItem::INLINE, true),
            ])->all(),
            'usage' => ['bytes' => (int) $user->briefcaseItems()->sum('size'), 'quota' => BriefcaseItem::QUOTA_BYTES, 'max_file_mb' => BriefcaseItem::MAX_KB / 1024],
            'allowed' => array_keys(BriefcaseItem::TYPES),
            'folders' => $this->folderList($user),
        ];
    }

    /** Every folder with its full path ("Finance / 2026"), for the "Move to..." list. */
    private function folderList(User $user): array
    {
        $all = $user->briefcaseItems()->where('kind', 'folder')->get(['id', 'parent_id', 'name'])->keyBy('id');
        $path = function ($f) use ($all) {
            $names = [];
            for ($i = 0; $f && $i < 50; $i++) {
                array_unshift($names, $f->name);
                $f = $f->parent_id ? $all->get($f->parent_id) : null;
            }

            return implode(' / ', $names);
        };

        return $all->map(fn ($f) => ['id' => $f->id, 'path' => $path($f)])->sortBy('path', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
    }
}
