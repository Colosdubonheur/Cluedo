<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_character_visibility.php';
require_once __DIR__ . '/_team_profiles_store.php';

$payload = json_decode((string) file_get_contents('php://input'), true);
$id = $payload['id'] ?? null;
$action = $payload['action'] ?? null;
$location = trim((string) ($payload['location'] ?? ''));
$penaltyValue = !empty($payload['value']);

if (!$id || !$action) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing params']);
  exit;
}

$data = cluedo_get_characters_data();
if (!isset($data[$id])) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'error' => 'unknown id']);
  exit;
}

if ($action === 'set_incomplete_team_penalty') {
  $character = $data[$id];
  if (!cluedo_character_is_active($character)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'character unavailable']);
    exit;
  }

  $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
  $activeToken = trim((string) (($queue[0] ?? [])['token'] ?? ''));
  if ($activeToken === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing active token']);
    exit;
  }

  try {
    cluedo_update_team_profiles(function (array $profilesStore) use ($activeToken, $penaltyValue): array {
      $profile = cluedo_get_team_profile($profilesStore, $activeToken);
      $profile['incomplete_team_penalty'] = $penaltyValue;
      $profilesStore['teams'][$activeToken] = $profile;
      return $profilesStore;
    });
  } catch (RuntimeException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'save failed']);
    exit;
  }

  echo json_encode(['ok' => true, 'changed' => true, 'incomplete_team_penalty' => $penaltyValue]);
  exit;
}

if ($action === 'remove_points') {
  $character = $data[$id];
  if (!cluedo_character_is_active($character)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'character unavailable']);
    exit;
  }

  $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
  $activeToken = trim((string) (($queue[0] ?? [])['token'] ?? ''));
  if ($activeToken === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing active token']);
    exit;
  }

  $delta = (int) ($payload['delta'] ?? 0);
  if (!in_array($delta, [-1, -2, -5], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid delta']);
    exit;
  }

  try {
    $updatedStore = cluedo_update_team_profiles(function (array $profilesStore) use ($activeToken, $delta): array {
      $profile = cluedo_get_team_profile($profilesStore, $activeToken);
      $profile['score'] = (int) ($profile['score'] ?? 0) + $delta;
      $profilesStore['teams'][$activeToken] = $profile;
      return $profilesStore;
    });
  } catch (RuntimeException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'save failed']);
    exit;
  }

  $updatedProfile = cluedo_get_team_profile($updatedStore, $activeToken);
  echo json_encode([
    'ok' => true,
    'changed' => true,
    'token' => $activeToken,
    'score' => (int) ($updatedProfile['score'] ?? 0),
    'delta' => $delta,
  ]);
  exit;
}

$result = ['ok' => true, 'changed' => false];
$error = null;
$status = 200;

cluedo_update_characters_data(function (array $lockedData) use ($id, $action, $location, &$result, &$error, &$status): array {
  if (!isset($lockedData[$id])) {
    $error = 'unknown id';
    $status = 404;
    return $lockedData;
  }

  $changed = cluedo_enforce_character_visibility($lockedData);

  if ($action === 'set_location') {
    $lockedData[$id]['location'] = $location;
    $result = ['ok' => true, 'changed' => true, 'location' => $location];
    return $lockedData;
  }

  if (!cluedo_character_is_active($lockedData[$id])) {
    $error = 'character unavailable';
    $status = 403;
    $result = ['ok' => false, 'error' => $error];
    return $changed ? $lockedData : $lockedData;
  }

  $now = time();
  $maxWait = 600;
  $queue = isset($lockedData[$id]['queue']) && is_array($lockedData[$id]['queue']) ? $lockedData[$id]['queue'] : [];
  $queue = array_values(array_filter($queue, function ($q) use ($now, $maxWait) {
    return isset($q['joined_at']) && ($now - (int) $q['joined_at']) < $maxWait;
  }));

  $activeIndex = null;
  foreach ($queue as $i => $entry) {
    if (trim((string) ($entry['team'] ?? '')) !== '') {
      $activeIndex = $i;
      break;
    }
  }

  if ($activeIndex === null) {
    $result = ['ok' => true, 'changed' => false];
    return $lockedData;
  }

  switch ($action) {
    case 'plus_30':
      $queue[$activeIndex]['joined_at'] = (int) ($queue[$activeIndex]['joined_at'] ?? $now) + 30;
      break;
    case 'minus_30':
      $queue[$activeIndex]['joined_at'] = (int) ($queue[$activeIndex]['joined_at'] ?? $now) - 30;
      break;
    case 'eject':
      array_splice($queue, $activeIndex, 1);
      break;
    default:
      $error = 'unknown action';
      $status = 400;
      $result = ['ok' => false, 'error' => $error];
      return $lockedData;
  }

  $lockedData[$id]['queue'] = array_values($queue);
  $result = ['ok' => true, 'changed' => true];
  return $lockedData;
});

if ($error !== null) {
  http_response_code($status);
}

echo json_encode($result);
