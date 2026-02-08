<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_character_visibility.php';

$id = $_GET['id'] ?? null;
if (!$id) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing id']);
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
$p = $data[$id];

if (!cluedo_character_is_active($p)) {
  if ($changed) {
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  }

  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'character unavailable']);
  exit;
}
$now = time();
$maxWait = 600;
$queue = isset($p['queue']) && is_array($p['queue']) ? $p['queue'] : [];
$queue = cluedo_clean_character_queue($queue, $now, $maxWait);

$timePerPlayer = max(1, (int) ($p['time_per_player'] ?? 120));
$queue = cluedo_apply_runtime_handover($queue, $now, $timePerPlayer);
$buffer = max(0, (int) ($p['buffer_before_next'] ?? 15));

$current = null;
$waiting = [];

if (isset($queue[0])) {
  $elapsed = max(0, $now - (int) ($queue[0]['joined_at'] ?? $now));
  $remaining = max(0, $timePerPlayer - $elapsed);
  $current = [
    'token' => (string) ($queue[0]['token'] ?? ''),
    'team' => (string) ($queue[0]['team'] ?? ''),
    'remaining_seconds' => $remaining,
    'state' => 'active',
  ];
}

for ($i = 1; $i < count($queue); $i++) {
  $waiting[] = [
    'token' => (string) ($queue[$i]['token'] ?? ''),
    'team' => (string) ($queue[$i]['team'] ?? ''),
    'position' => $i,
    'estimated_seconds' => (($current ? ($current['remaining_seconds'] + $buffer) : 0) + ($i - 1) * $timePerPlayer),
    'state' => 'waiting',
  ];
}

$data[$id]['queue'] = $queue;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode([
  'ok' => true,
  'character' => [
    'id' => (string) $id,
    'nom' => (string) ($p['nom'] ?? ''),
    'time_per_player' => $timePerPlayer,
    'buffer_before_next' => $buffer,
    'photo' => (string) ($p['photo'] ?? ''),
  ],
  'current' => $current,
  'queue' => $waiting,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
