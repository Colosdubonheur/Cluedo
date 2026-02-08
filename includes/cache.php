<?php

declare(strict_types=1);

function cluedo_send_html_no_cache_headers(): void
{
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
}

function cluedo_asset_url(string $relativePath): string
{
    static $versionCache = [];

    $normalizedPath = ltrim($relativePath, './');

    if (!array_key_exists($normalizedPath, $versionCache)) {
        $absolutePath = dirname(__DIR__) . '/' . $normalizedPath;

        if (is_file($absolutePath)) {
            $hash = md5_file($absolutePath);
            $versionCache[$normalizedPath] = $hash === false ? (string) filemtime($absolutePath) : substr($hash, 0, 12);
        } else {
            $versionCache[$normalizedPath] = (string) time();
        }
    }

    $separator = strpos($relativePath, '?') === false ? '?' : '&';

    return $relativePath . $separator . 'v=' . rawurlencode($versionCache[$normalizedPath]);
}
