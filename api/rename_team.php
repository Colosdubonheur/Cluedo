<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_deleted_team_tokens_store.php';
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_character_visibility.php';

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
  $input = $_POST;
}

$id = $input['id'] ?? null;
$teamId = $input['team_id'] ?? ($input['token'] ?? null);
$newName = trim((string) ($input['nouveau_nom'] ?? ($input['team_name'] ?? '')));

if (cluedo_is_team_token_deleted((string) $teamId)) {
  http_response_code(410);
  echo json_encode(['ok' => false, 'error' => 'token deleted', 'token_invalidated' => true]);
  exit;
}

if (!$id || !$teamId || $newName === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing id, team_id or nouveau_nom']);
  exit;
}

$response = null;
$error = null;
$status = 200;

cluedo_update_characters_data(function (array $data) use ($id, $teamId, $newName, &$response, &$error, &$status): array {
  if (!isset($data[$id])) {
    $error = 'unknown id';
    $status = 404;
    return $data;
  }

  cluedo_enforce_character_visibility($data);

  if (!cluedo_character_is_active($data[$id])) {
    $error = 'character unavailable';
    $status = 403;
    return $data;
  }

  $queue = isset($data[$id]['queue']) && is_array($data[$id]['queue']) ? $data[$id]['queue'] : [];
  $index = null;
  foreach ($queue as $i => $entry) {
    if ((string) ($entry['token'] ?? '') === (string) $teamId) {
      $index = $i;
      break;
    }
  }

  if ($index === null) {
    $error = 'team not found in queue';
    $status = 404;
    return $data;
  }

  $queue[$index]['team'] = $newName;
  $data[$id]['queue'] = $queue;

  $response = [
    'ok' => true,
    'equipe' => [
      'id' => (string) $teamId,
      'nom' => $newName,
    ],
    'file' => [
      'position' => $index,
      'total' => count($queue),
    ],
  ];

  return $data;
});

if ($error !== null) {
  http_response_code($status);
  echo json_encode(['ok' => false, 'error' => $error]);
  exit;
}

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
