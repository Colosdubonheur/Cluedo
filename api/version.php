<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/version.json';
$version = '';
$n = null;

if (is_readable($versionFile)) {
  $rawContent = file_get_contents($versionFile);

  if ($rawContent !== false) {
    $decoded = json_decode($rawContent, true);

    if (is_array($decoded) && array_key_exists('n', $decoded) && is_int($decoded['n']) && $decoded['n'] >= 0) {
      $n = $decoded['n'];
    }
  }
}

if ($n !== null) {
  $major = intdiv($n, 100) + 1;
  $minor = intdiv($n % 100, 10);
  $patch = $n % 10;
  $version = $major . '.' . $minor . '.' . $patch;
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
