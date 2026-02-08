<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/version.json';
$version = '';

/**
 * Transforme un numéro de build global en version MAJEUR.MINEUR.PATCH.
 */
function cluedo_format_version_from_build(int $build): string {
  $major = intdiv($build, 1000) + 1;
  $minor = intdiv($build % 1000, 100);
  $patch = $build % 100;
  $patchDisplay = $patch === 0 ? '0' : str_pad((string) $patch, 2, '0', STR_PAD_LEFT);
  return $major . '.' . $minor . '.' . $patchDisplay;
}

if (is_readable($versionFile)) {
  $rawContent = file_get_contents($versionFile);

  if ($rawContent !== false) {
    $decoded = json_decode($rawContent, true);

    if (is_array($decoded) && array_key_exists('build', $decoded) && is_int($decoded['build']) && $decoded['build'] >= 0) {
      $version = cluedo_format_version_from_build($decoded['build']);
    }
  }
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
