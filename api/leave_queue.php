<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_deleted_team_tokens_store.php';
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_character_visibility.php';

$input = json_decode((string) file_get_contents('php://input'), true);
$id = $input['id'] ?? null;
$token = $input['token'] ?? null;

if (cluedo_is_team_token_deleted((string) $token)) {
  http_response_code(410);
  echo json_encode(['ok' => false, 'error' => 'token deleted', 'token_invalidated' => true]);
  exit;
}

if (!$id || !$token) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing params']);
  exit;
}

$removed = false;
$error = null;
$status = 200;

cluedo_update_characters_data(function (array $data) use ($id, $token, &$removed, &$error, &$status): array {
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
  $initialCount = count($queue);
  $queue = array_values(array_filter($queue, function ($entry) use ($token) {
    return (string) ($entry['token'] ?? '') !== (string) $token;
  }));

  $data[$id]['queue'] = $queue;
  $removed = $initialCount !== count($queue);

  return $data;
});

if ($error !== null) {
  http_response_code($status);
  echo json_encode(['ok' => false, 'error' => $error]);
  exit;
}

echo json_encode([
  'ok' => true,
  'removed' => $removed,
]);
