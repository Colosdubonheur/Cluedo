<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_deleted_team_tokens_store.php';
require_once __DIR__ . '/_team_profiles_store.php';

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
  $input = $_POST;
}

$token = trim((string) ($input['token'] ?? ''));


if (cluedo_is_team_token_deleted($token)) {
  http_response_code(410);
  echo json_encode(['ok' => false, 'error' => 'token deleted', 'token_invalidated' => true]);
  exit;
}

if ($token === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing token']);
  exit;
}

$profilesStore = cluedo_load_team_profiles();
$profile = cluedo_get_team_profile($profilesStore, $token);

if (isset($input['team_name'])) {
  $profile['team_name'] = trim((string) $input['team_name']);
}

if (isset($input['players']) && is_array($input['players'])) {
  $players = array_slice(array_pad(array_map(function ($name) {
    return trim((string) $name);
  }, $input['players']), 10, ''), 0, 10);
  $profile['players'] = $players;
}

try {
  $updatedStore = cluedo_update_team_profiles(function (array $lockedStore) use ($token, $profile): array {
    $lockedStore['teams'][$token] = $profile;
    return $lockedStore;
  });
  $profile = cluedo_get_team_profile($updatedStore, $token);
} catch (RuntimeException $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'save failed']);
  exit;
}

echo json_encode(['ok' => true, 'profile' => $profile], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
