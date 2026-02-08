<?php
header('Content-Type: application/json; charset=utf-8');

$id = $_GET['id'] ?? null;
$token = $_GET['token'] ?? null;
$teamNameInput = trim((string) ($_GET['team_name'] ?? ($_GET['team'] ?? '')));

if (!$id || !$token) {
  echo json_encode(["error" => "missing id or token"]);
  exit;
}

$path = __DIR__ . '/../data/personnages.json';
$data = json_decode(file_get_contents($path), true);

if (!isset($data[$id])) {
  echo json_encode(["error" => "unknown id"]);
  exit;
}

$p = $data[$id];
$now = time();

if (!isset($p['queue']) || !is_array($p['queue'])) {
  $p['queue'] = [];
}

$MAX_WAIT = 600; // 10 minutes
$p['queue'] = array_values(array_filter($p['queue'], function ($q) use ($now, $MAX_WAIT) {
  return isset($q['joined_at']) && ($now - $q['joined_at']) < $MAX_WAIT;
}));

$index = null;
foreach ($p['queue'] as $i => $q) {
  if (($q['token'] ?? null) === $token) {
    $index = $i;
    break;
  }
}

if ($index === null) {
  $resolvedTeamName = $teamNameInput !== '' ? $teamNameInput : 'Équipe sans nom';
  $p['queue'][] = [
    "token" => $token,
    "team" => $resolvedTeamName,
    "joined_at" => $now,
  ];
  $index = count($p['queue']) - 1;
} else {
  $existingTeamName = trim((string) ($p['queue'][$index]['team'] ?? ''));

  if ($existingTeamName === '' && $teamNameInput !== '') {
    $p['queue'][$index]['team'] = $teamNameInput;
    $existingTeamName = $teamNameInput;
  }

  if ($existingTeamName === '') {
    $existingTeamName = 'Équipe sans nom';
    $p['queue'][$index]['team'] = $existingTeamName;
  }

  $resolvedTeamName = $existingTeamName;
}

$timePerPlayer = (int) ($p['time_per_player'] ?? 120);
$buffer = (int) ($p['buffer_before_next'] ?? 15);

$first = $p['queue'][0] ?? ["joined_at" => $now];
$elapsedFirst = $now - ($first['joined_at'] ?? $now);
$remainingFirst = max(0, $timePerPlayer - $elapsedFirst);

$wait = 0;
if ($index > 0) {
  $wait += $remainingFirst;
  $wait += ($index - 1) * $timePerPlayer;
  $wait += $buffer;
}

$canAccess = ($index === 0);
$myRemaining = $canAccess ? $remainingFirst : 0;
$previousTeam = $index > 0 ? (string) ($p['queue'][$index - 1]['team'] ?? '') : '';
$state = $canAccess && $myRemaining <= 0 ? 'done' : 'waiting';

$data[$id] = $p;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$response = [
  "state" => $state,
  "personnage" => [
    "id" => (string) $id,
    "nom" => $p['nom'] ?? '',
  ],
  "equipe" => [
    "id" => (string) $token,
    "nom" => $resolvedTeamName,
  ],
  "file" => [
    "position" => $index,
    "total" => count($p['queue']),
    "equipe_precedente" => $previousTeam,
    "temps_attente_estime_seconds" => max(0, $wait),
  ],
  "photo" => $p['photo'] ?? '',
  "can_access" => $canAccess,
  "my_remaining" => $myRemaining,

  // Champs hérités (compatibilité)
  "id" => $id,
  "nom" => $p['nom'] ?? '',
  "position" => $index,
  "queue_length" => count($p['queue']),
  "wait_remaining" => max(0, $wait),
  "time_per_player" => $timePerPlayer,
  "buffer_before_next" => $buffer,
  "previous_team" => $previousTeam,
];

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
