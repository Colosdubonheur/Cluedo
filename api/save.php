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

cluedo_update_characters_data(function (array $currentData) use ($incomingData): array {
  $mergedData = cluedo_normalize_characters_data($incomingData);

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
  return $mergedData;
});

echo json_encode(['ok' => true]);
