<?php

return [
    'verify_ssl' => filter_var(
        env('SCRAPER_VERIFY_SSL', true),
        FILTER_VALIDATE_BOOLEAN
    ),
];
