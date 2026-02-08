<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/app_version.txt';
$version = '';

if (is_readable($versionFile)) {
  $rawVersion = file_get_contents($versionFile);
  if ($rawVersion !== false) {
    $candidate = trim($rawVersion);
    if (preg_match('/^V\d{4}\.\d+$/', $candidate) === 1) {
      $version = $candidate;
    }
  }
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
