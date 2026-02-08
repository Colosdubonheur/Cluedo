<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_character_visibility.php';

$input = json_decode((string) file_get_contents('php://input'), true);
$id = $input['id'] ?? null;
$token = $input['token'] ?? null;

if (!$id || !$token) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing params']);
  exit;
}

$path = cluedo_data_path();
$data = json_decode(file_get_contents($path), true);

if (!isset($data[$id])) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'error' => 'unknown id']);
  exit;
}

$changed = cluedo_enforce_character_visibility($data);

if (!cluedo_character_is_active($data[$id])) {
  if ($changed) {
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  }

  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'character unavailable']);
  exit;
}

$queue = isset($data[$id]['queue']) && is_array($data[$id]['queue']) ? $data[$id]['queue'] : [];
$initialCount = count($queue);
$queue = array_values(array_filter($queue, function ($entry) use ($token) {
  return (string) ($entry['token'] ?? '') !== (string) $token;
}));

$data[$id]['queue'] = $queue;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode([
  'ok' => true,
  'removed' => $initialCount !== count($queue),
]);
