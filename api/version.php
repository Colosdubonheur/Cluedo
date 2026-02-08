<?php
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/app_version.txt';
$versionPattern = '/^\d{4}\.\d{2}\.\d{2}\.\d{2}\.\d{2}$/';
$version = '';

if (file_exists($versionFile)) {
  $rawVersion = trim((string) file_get_contents($versionFile));
  if (preg_match($versionPattern, $rawVersion) === 1) {
    $version = $rawVersion;
  }
}

if ($version === '') {
  $version = date('Y.m.d.H.i');
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
