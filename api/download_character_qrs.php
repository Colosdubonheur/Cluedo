<?php

declare(strict_types=1);

require_once __DIR__ . '/_data_store.php';

function cluedo_qr_download_error(int $statusCode, string $message): void
{
  http_response_code($statusCode);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
  exit;
}

function cluedo_qr_safe_filename_part(string $value): string
{
  $value = trim($value);
  if ($value === '') {
    return 'Personnage';
  }

  if (function_exists('iconv')) {
    $transliterated = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if ($transliterated !== false) {
      $value = $transliterated;
    }
  }

  $value = preg_replace('/[^A-Za-z0-9]+/', '-', $value) ?? 'Personnage';
  $value = trim($value, '-');

  return $value !== '' ? $value : 'Personnage';
}

function cluedo_qr_fetch(string $url): ?string
{
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    if ($ch !== false) {
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 8,
      ]);
      $response = curl_exec($ch);
      $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);

      if (is_string($response) && $response !== '' && $statusCode >= 200 && $statusCode < 300) {
        return $response;
      }
    }
  }

  $context = stream_context_create([
    'http' => [
      'method' => 'GET',
      'timeout' => 15,
    ],
  ]);

  $contents = @file_get_contents($url, false, $context);
  return is_string($contents) && $contents !== '' ? $contents : null;
}

function cluedo_qr_png_contents(string $absoluteUrl): ?string
{
  $providers = [
    'https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=' . rawurlencode($absoluteUrl),
    'https://chart.googleapis.com/chart?cht=qr&chs=600x600&chl=' . rawurlencode($absoluteUrl),
  ];

  foreach ($providers as $providerUrl) {
    $contents = cluedo_qr_fetch($providerUrl);
    if (!is_string($contents)) {
      continue;
    }

    if (substr($contents, 0, 8) === "\x89PNG\r\n\x1A\n") {
      return $contents;
    }
  }

  return null;
}

$dataPath = cluedo_data_path();
$characters = json_decode((string) @file_get_contents($dataPath), true);
if (!is_array($characters)) {
  cluedo_qr_download_error(500, 'Impossible de charger les personnages.');
}

$zipPath = tempnam(sys_get_temp_dir(), 'cluedo-character-qrs-');
if ($zipPath === false) {
  cluedo_qr_download_error(500, 'Impossible de créer le fichier temporaire.');
}

$zip = new ZipArchive();
if ($zip->open($zipPath, ZipArchive::OVERWRITE) !== true) {
  @unlink($zipPath);
  cluedo_qr_download_error(500, 'Impossible de préparer l’archive ZIP.');
}

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = isset($_SERVER['HTTP_HOST']) && is_string($_SERVER['HTTP_HOST']) && $_SERVER['HTTP_HOST'] !== ''
  ? $_SERVER['HTTP_HOST']
  : 'localhost';
$basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
$rootPath = $basePath === '/api' ? '' : preg_replace('#/api$#', '', $basePath);

for ($id = 1; $id <= 15; $id++) {
  $entry = isset($characters[(string) $id]) && is_array($characters[(string) $id]) ? $characters[(string) $id] : [];
  $rawName = isset($entry['nom']) ? (string) $entry['nom'] : '';
  $name = $rawName !== '' ? $rawName : sprintf('Personnage %d', $id);
  $safeName = cluedo_qr_safe_filename_part($name);
  $filename = sprintf('%02d-%s.png', $id, $safeName);

  $targetUrl = sprintf('%s://%s%s/character.html?id=%d', $scheme, $host, $rootPath, $id);
  $pngContents = cluedo_qr_png_contents($targetUrl);

  if (!is_string($pngContents)) {
    $zip->close();
    @unlink($zipPath);
    cluedo_qr_download_error(502, sprintf('Échec de génération du QR code pour le personnage %d.', $id));
  }

  $zip->addFromString($filename, $pngContents);
}

$zip->close();
$zipData = @file_get_contents($zipPath);
@unlink($zipPath);

if (!is_string($zipData) || $zipData === '') {
  cluedo_qr_download_error(500, 'Impossible de lire l’archive générée.');
}

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="personnages-qr-codes.zip"');
header('Content-Length: ' . strlen($zipData));
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

echo $zipData;
exit;
