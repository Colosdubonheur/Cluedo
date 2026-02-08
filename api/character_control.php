<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';

$payload = json_decode((string) file_get_contents('php://input'), true);
$id = $payload['id'] ?? null;
$action = $payload['action'] ?? null;

if (!$id || !$action) {
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

$now = time();
$maxWait = 600;
$queue = isset($data[$id]['queue']) && is_array($data[$id]['queue']) ? $data[$id]['queue'] : [];
$queue = array_values(array_filter($queue, function ($q) use ($now, $maxWait) {
  return isset($q['joined_at']) && ($now - $q['joined_at']) < $maxWait;
}));

$findActiveIndex = function (array $items): ?int {
  foreach ($items as $i => $entry) {
    if (trim((string) ($entry['team'] ?? '')) !== '') {
      return $i;
    }
  }
  return null;
};

$activeIndex = $findActiveIndex($queue);
if ($activeIndex === null) {
  echo json_encode(['ok' => true, 'changed' => false]);
  exit;
}

switch ($action) {
  case 'plus_30':
    $queue[$activeIndex]['joined_at'] = (int) ($queue[$activeIndex]['joined_at'] ?? $now) - 30;
    break;
  case 'minus_30':
    $queue[$activeIndex]['joined_at'] = (int) ($queue[$activeIndex]['joined_at'] ?? $now) + 30;
    break;
  case 'eject':
    array_splice($queue, $activeIndex, 1);
    break;
  default:
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'unknown action']);
    exit;
}

$data[$id]['queue'] = array_values($queue);
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true, 'changed' => true]);
