<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'title',
        'price',
        'original_price',
        'discount_percentage',
        'store',
        'affiliate_url',
        'image_url',
        'description',
        'degrees',
        'coupon_code',
        'monitor_interval_hours',
    ];

    public function scrapeLogs(): HasMany
    {
        return $this->hasMany(ScrapeLog::class);
    }

    public function priceHistories()
    {
        return $this->hasMany(PriceHistory::class);
    }
}
