<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/version.json';
$version = '';

if (is_readable($versionFile)) {
  $rawContent = file_get_contents($versionFile);

  if ($rawContent !== false) {
    $decoded = json_decode($rawContent, true);

    if (is_array($decoded)) {
      if (array_key_exists('version', $decoded) && is_string($decoded['version'])) {
        $candidate = trim($decoded['version']);
        if ($candidate !== '') {
          $version = $candidate;
        }
      } elseif (array_key_exists('n', $decoded) && is_int($decoded['n']) && $decoded['n'] >= 0) {
        // Compatibilité ascendante avec l'ancien format basé sur un compteur.
        $n = $decoded['n'];
        $major = intdiv($n, 100) + 1;
        $minor = intdiv($n % 100, 10);
        $patch = $n % 10;
        $version = $major . '.' . $minor . '.' . $patch;
      }
    }
  }
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
