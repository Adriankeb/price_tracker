<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScrapeLog extends Model
{
    protected $fillable = [
        'product_id',
        'target_url',
        'status',
        'http_status_code',
        'duration_ms',
        'proxy_used',
        'error_message',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}