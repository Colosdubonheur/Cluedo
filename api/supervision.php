<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';

$path = cluedo_data_path();
$data = json_decode(file_get_contents($path), true);
$now = time();
$maxWait = 600;
$rows = [];

foreach ($data as $characterId => $character) {
  $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
  $queue = array_values(array_filter($queue, function ($q) use ($now, $maxWait) {
    return isset($q['joined_at']) && ($now - $q['joined_at']) < $maxWait;
  }));

  $queue = array_values(array_filter($queue, function ($entry) {
    return trim((string) ($entry['team'] ?? '')) !== '';
  }));

  $timePerPlayer = max(1, (int) ($character['time_per_player'] ?? 120));
  $buffer = max(0, (int) ($character['buffer_before_next'] ?? 15));
  $remainingFirst = 0;

  if (isset($queue[0])) {
    $elapsed = max(0, $now - (int) ($queue[0]['joined_at'] ?? $now));
    $remainingFirst = max(0, $timePerPlayer - $elapsed);
  }

  foreach ($queue as $index => $entry) {
    $state = $index === 0 ? 'active' : 'waiting';
    $eta = $index === 0 ? $remainingFirst : ($remainingFirst + $buffer + ($index - 1) * $timePerPlayer);

    $rows[] = [
      'team' => (string) ($entry['team'] ?? ''),
      'personnage' => [
        'id' => (string) $characterId,
        'nom' => (string) ($character['nom'] ?? ''),
      ],
      'state' => $state,
      'remaining_or_eta_seconds' => max(0, $eta),
      'queue_position' => $index,
    ];
  }

  $data[$characterId]['queue'] = $queue;
}

file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true, 'teams' => $rows], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
