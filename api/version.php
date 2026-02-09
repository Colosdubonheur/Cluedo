<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

$versionFile = __DIR__ . '/../data/version.json';
$version = null;
$error = null;

if (!is_readable($versionFile)) {
  $error = 'Fichier de version introuvable.';
} else {
  $rawContent = file_get_contents($versionFile);

  if ($rawContent === false) {
    $error = 'Lecture du fichier de version impossible.';
  } else {
    $decoded = json_decode($rawContent, true);

    if (!is_array($decoded) || !array_key_exists('version', $decoded) || !is_string($decoded['version'])) {
      $error = 'Format de version invalide : clé "version" manquante.';
    } else {
      $candidate = trim($decoded['version']);

      if (!preg_match('/^\d+\.\d+\.\d+$/', $candidate)) {
        $error = 'Format de version invalide : attendu MAJEUR.MINEUR.PATCH.';
      } else {
        $version = $candidate;
      }
    }
  }
}

if ($error !== null) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'error' => $error,
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

echo json_encode([
  'ok' => true,
  'version' => $version,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
