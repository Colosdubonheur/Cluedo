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
  $mergedData = cluedo_normalize_characters_data($currentData);

  foreach ($incomingData as $id => $incomingCharacter) {
    $characterId = (string) $id;
    if (!isset($mergedData[$characterId]) || !is_array($incomingCharacter)) {
      continue;
    }

    $currentCharacter = isset($currentData[$characterId]) && is_array($currentData[$characterId])
      ? $currentData[$characterId]
      : [];

    if (array_key_exists('nom', $incomingCharacter)) {
      $incomingName = trim((string) ($incomingCharacter['nom'] ?? ''));
      if ($incomingName !== '') {
        $mergedData[$characterId]['nom'] = $incomingName;
      } elseif (trim((string) ($currentCharacter['nom'] ?? '')) !== '') {
        $mergedData[$characterId]['nom'] = trim((string) $currentCharacter['nom']);
      }
    }

    if (array_key_exists('location', $incomingCharacter)) {
      $incomingLocation = trim((string) ($incomingCharacter['location'] ?? ''));
      if ($incomingLocation !== '') {
        $mergedData[$characterId]['location'] = $incomingLocation;
      } elseif (trim((string) ($currentCharacter['location'] ?? '')) !== '') {
        $mergedData[$characterId]['location'] = trim((string) $currentCharacter['location']);
      }
    }

    if (array_key_exists('time_per_player', $incomingCharacter)) {
      $mergedData[$characterId]['time_per_player'] = max(1, (int) ($incomingCharacter['time_per_player'] ?? 120));
    }

    if (array_key_exists('buffer_before_next', $incomingCharacter)) {
      $mergedData[$characterId]['buffer_before_next'] = max(0, (int) ($incomingCharacter['buffer_before_next'] ?? 15));
    }

    if (array_key_exists('active', $incomingCharacter)) {
      $mergedData[$characterId]['active'] = ($incomingCharacter['active'] ?? true) !== false;
    } else {
      $mergedData[$characterId]['active'] = ($currentCharacter['active'] ?? true) !== false;
    }

    if (array_key_exists('photo', $incomingCharacter)) {
      $incomingPhoto = trim((string) ($incomingCharacter['photo'] ?? ''));
      $currentPhoto = trim((string) ($currentCharacter['photo'] ?? ''));
      if ($incomingPhoto !== '') {
        $mergedData[$characterId]['photo'] = $incomingPhoto;
      } elseif ($currentPhoto !== '') {
        $mergedData[$characterId]['photo'] = $currentPhoto;
      }
    }
  }

  foreach ($mergedData as $id => &$character) {
    if (!is_array($character)) {
      continue;
    }

    $character['active'] = ($character['active'] ?? true) !== false;
  }
  unset($character);

  cluedo_enforce_character_visibility($mergedData);
  return $mergedData;
});

echo json_encode(['ok' => true]);
