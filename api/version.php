<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/version.json';
$version = '';

if (is_readable($versionFile)) {
  $rawContent = file_get_contents($versionFile);

  if ($rawContent !== false) {
    $decoded = json_decode($rawContent, true);

    if (is_array($decoded) && array_key_exists('build', $decoded) && is_int($decoded['build']) && $decoded['build'] >= 0) {
      $build = $decoded['build'];
      $major = intdiv($build, 1000) + 1;
      $minor = intdiv($build % 1000, 100);
      $patch = $build % 100;
      $patchDisplay = $patch === 0 ? '0' : str_pad((string) $patch, 2, '0', STR_PAD_LEFT);
      $version = $major . '.' . $minor . '.' . $patchDisplay;
    }
  }
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
