<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PriceHistory extends Model
{
    // Esto da permiso a Laravel para guardar datos en estas columnas
    protected $fillable = [
        'product_id',
        'price'
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}