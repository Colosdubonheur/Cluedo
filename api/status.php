<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';

$id = $_GET['id'] ?? null;
$token = $_GET['token'] ?? null;
$teamNameInput = trim((string) ($_GET['team_name'] ?? ($_GET['team'] ?? '')));

function normalize_team_name(string $name): string {
  $trimmed = trim($name);
  if ($trimmed === '') {
    return '';
  }

  $normalized = mb_strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $trimmed) ?: $trimmed, 'UTF-8');
  $normalized = preg_replace('/\s+/', ' ', $normalized ?? '');

  if ($normalized === 'equipe sans nom') {
    return '';
  }

  return $trimmed;
}

function is_initialized_team(array $entry): bool {
  return normalize_team_name((string) ($entry['team'] ?? '')) !== '';
}

if (!$id || !$token) {
  echo json_encode(["error" => "missing id or token"]);
  exit;
}

$path = cluedo_data_path();
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
  return isset($q['joined_at']) && ($now - (int) $q['joined_at']) < $MAX_WAIT;
}));

$index = null;
foreach ($p['queue'] as $i => $q) {
  if (($q['token'] ?? null) === $token) {
    $index = $i;
    break;
  }
}

if ($index === null) {
  $resolvedTeamName = normalize_team_name($teamNameInput);
  $p['queue'][] = [
    'token' => $token,
    'team' => $resolvedTeamName,
    'joined_at' => $resolvedTeamName !== '' ? $now : null,
    'created_at' => $now,
  ];
  $index = count($p['queue']) - 1;
} else {
  $existingTeamName = normalize_team_name((string) ($p['queue'][$index]['team'] ?? ''));

  if ($existingTeamName === '' && normalize_team_name($teamNameInput) !== '') {
    $p['queue'][$index]['joined_at'] = $now;
    $p['queue'][$index]['team'] = $teamNameInput;
    $existingTeamName = normalize_team_name($teamNameInput);
  }

  if ($existingTeamName === '') {
    $p['queue'][$index]['team'] = '';
  }

  $resolvedTeamName = $existingTeamName;
}

$timePerPlayer = max(1, (int) ($p['time_per_player'] ?? 120));
$buffer = max(0, (int) ($p['buffer_before_next'] ?? 15));

$visibleQueue = array_values(array_filter($p['queue'], 'is_initialized_team'));
$teamNeedsName = $resolvedTeamName === '';

$activeRemainingBeforeTakeover = null;
$firstWaitingEta = null;

if (count($visibleQueue) > 0) {
  $activeStartedAt = (int) ($visibleQueue[0]['joined_at'] ?? $now);
  $activeElapsed = max(0, $now - $activeStartedAt);
  $activeReservedRemaining = max(0, $timePerPlayer - $activeElapsed);

  if ($activeReservedRemaining <= 0 && count($visibleQueue) > 1) {
    array_shift($visibleQueue);

    if (isset($visibleQueue[0])) {
      $visibleQueue[0]['joined_at'] = $now;
    }
  }

  if (isset($visibleQueue[0])) {
    $activeStartedAt = (int) ($visibleQueue[0]['joined_at'] ?? $now);
    $activeElapsed = max(0, $now - $activeStartedAt);
    $activeReservedRemaining = max(0, $timePerPlayer - $activeElapsed);
    $activeRemainingBeforeTakeover = $activeReservedRemaining;
    $firstWaitingEta = $activeReservedRemaining;
  }
}

$visibleIndex = null;
foreach ($visibleQueue as $i => $entry) {
  if (($entry['token'] ?? null) === $token) {
    $visibleIndex = $i;
    break;
  }
}

$canAccess = !$teamNeedsName && $visibleIndex === 0;

$wait = 0;
if (!$teamNeedsName && $visibleIndex !== null && $visibleIndex > 0) {
  $wait = max(0, (int) $firstWaitingEta);
  if ($visibleIndex > 1) {
    $wait += ($visibleIndex - 1) * $timePerPlayer;
  }
}

$previousTeam = ($visibleIndex !== null && $visibleIndex > 0)
  ? (string) ($visibleQueue[$visibleIndex - 1]['team'] ?? '')
  : '';
$nextTeamName = isset($visibleQueue[1]['team']) ? (string) $visibleQueue[1]['team'] : '';
$state = $teamNeedsName ? 'need_name' : ($canAccess ? 'active' : 'waiting');
$legacyState = $canAccess ? 'done' : 'waiting';

$p['queue'] = $visibleQueue;
$p['handover'] = null;

$data[$id] = $p;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$response = [
  'state' => $state,
  'legacy_state' => $legacyState,
  'personnage' => [
    'id' => (string) $id,
    'nom' => $p['nom'] ?? '',
  ],
  'equipe' => [
    'id' => (string) $token,
    'nom' => $resolvedTeamName,
  ],
  'file' => [
    'position' => $teamNeedsName ? null : $visibleIndex,
    'total' => count($visibleQueue),
    'equipe_precedente' => $previousTeam,
    'next_team_name' => $nextTeamName,
    'temps_attente_estime_seconds' => max(0, (int) $wait),
  ],
  'timers' => [
    'active_remaining_before_takeover_seconds' => $activeRemainingBeforeTakeover,
    'courtesy_remaining_seconds' => null,
    'time_per_player_seconds' => $timePerPlayer,
    'buffer_before_next_seconds' => $buffer,
  ],
  'photo' => $p['photo'] ?? '',
  'can_access' => $canAccess,
  'my_remaining' => $canAccess && $activeRemainingBeforeTakeover !== null ? max(0, (int) $activeRemainingBeforeTakeover) : 0,

  // Champs hérités (compatibilité)
  'id' => $id,
  'nom' => $p['nom'] ?? '',
  'position' => $teamNeedsName ? null : $visibleIndex,
  'queue_length' => count($visibleQueue),
  'wait_remaining' => max(0, (int) $wait),
  'time_per_player' => $timePerPlayer,
  'buffer_before_next' => $buffer,
  'previous_team' => $previousTeam,
];

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
