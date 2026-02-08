<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_character_visibility.php';

cluedo_require_admin_pin();

$incomingRaw = (string) file_get_contents('php://input');
$incomingData = json_decode($incomingRaw, true);

if (!is_array($incomingData)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid payload']);
  exit;
}

$dataPath = cluedo_data_path();
$currentRaw = (string) file_get_contents($dataPath);
$currentData = json_decode($currentRaw, true);

if (!is_array($currentData)) {
  $currentData = [];
}

$mergedData = $incomingData;

foreach ($mergedData as $id => &$character) {
  if (!is_array($character)) {
    continue;
  }

  $incomingPhoto = $character['photo'] ?? null;
  $currentPhoto = $currentData[$id]['photo'] ?? null;

  if ((!is_string($incomingPhoto) || trim($incomingPhoto) === '') && is_string($currentPhoto) && trim($currentPhoto) !== '') {
    $character['photo'] = $currentPhoto;
  }

  $character['active'] = ($character['active'] ?? true) !== false;
}
unset($character);

cluedo_enforce_character_visibility($mergedData);

$encoded = json_encode($mergedData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($encoded === false || file_put_contents($dataPath, $encoded) === false) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'save failed']);
  exit;
}

echo json_encode(['ok' => true]);
