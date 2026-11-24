<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One thing in your Briefcase: a folder, an uploaded file, or a link to a document online. */
#[Fillable(['user_id', 'parent_id', 'kind', 'name', 'path', 'extension', 'size', 'url', 'version'])]
class BriefcaseItem extends Model
{
    /** Allowed uploads and the type we serve them as (never the type the browser claims). */
    public const TYPES = [
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xlsm' => 'application/vnd.ms-excel.sheet.macroEnabled.12',
        'xls' => 'application/vnd.ms-excel',
        'xlsb' => 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
        'csv' => 'text/csv',
        'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
        'numbers' => 'application/octet-stream',
        'pdf' => 'application/pdf',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'odt' => 'application/vnd.oasis.opendocument.text',
        'rtf' => 'application/rtf',
        'txt' => 'text/plain',
        'md' => 'text/plain',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'zip' => 'application/zip',
    ];

    /** These are safe for the browser to show inside a tab; everything else downloads. */
    public const INLINE = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md', 'csv'];

    public const MAX_KB = 25600;          // 25 MB per file

    public const QUOTA_BYTES = 524288000; // 500 MB per user

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function isFolder(): bool
    {
        return $this->kind === 'folder';
    }
}
