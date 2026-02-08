<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_character_visibility.php';

$id = $_GET['id'] ?? null;
$token = $_GET['token'] ?? null;
$teamNameInput = trim((string) ($_GET['team_name'] ?? ($_GET['team'] ?? '')));
$joinIntent = (string) ($_GET['join'] ?? '') === '1';
$forceSwitch = (string) ($_GET['force_switch'] ?? '') === '1';

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

function cluedo_find_token_in_queue(array $queue, string $token): ?int {
  foreach ($queue as $i => $entry) {
    if ((string) ($entry['token'] ?? '') === $token) {
      return (int) $i;
    }
  }

  return null;
}

function cluedo_find_token_engagement(array $data, string $currentId, string $token, int $now, int $maxWait, int $defaultTimePerPlayer): ?array {
  foreach ($data as $characterId => $character) {
    if ((string) $characterId === (string) $currentId) {
      continue;
    }

    $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
    $queue = cluedo_clean_character_queue($queue, $now, $maxWait);
    $queue = cluedo_apply_runtime_handover($queue, $now, max(1, (int) ($character['time_per_player'] ?? $defaultTimePerPlayer)));

    $index = cluedo_find_token_in_queue($queue, $token);
    if ($index === null) {
      continue;
    }

    return [
      'character_id' => (string) $characterId,
      'character_name' => (string) ($character['nom'] ?? ''),
      'state' => $index === 0 ? 'active' : 'waiting',
      'queue' => $queue,
    ];
  }

  return null;
}


if (!$id || !$token) {
  echo json_encode(["error" => "missing id or token"]);
  exit;
}

$path = cluedo_data_path();
$fp = fopen($path, 'c+');

if ($fp === false || !flock($fp, LOCK_EX)) {
  echo json_encode(["error" => "storage unavailable"]);
  exit;
}

$rawContent = stream_get_contents($fp);
$data = json_decode($rawContent === false ? '{}' : $rawContent, true);
if (!is_array($data)) {
  $data = [];
}

$visibilityChanged = cluedo_enforce_character_visibility($data);

if (!isset($data[$id])) {
  flock($fp, LOCK_UN);
  fclose($fp);
  echo json_encode(["error" => "unknown id"]);
  exit;
}

$p = $data[$id];

if (!cluedo_character_is_active($p)) {
  if ($visibilityChanged) {
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
  }

  flock($fp, LOCK_UN);
  fclose($fp);
  http_response_code(403);
  echo json_encode(['error' => 'character unavailable']);
  exit;
}
$now = time();

if (!isset($p['queue']) || !is_array($p['queue'])) {
  $p['queue'] = [];
}

$MAX_WAIT = 600; // 10 minutes
$p['queue'] = cluedo_clean_character_queue($p['queue'], $now, $MAX_WAIT);

$timePerPlayer = max(1, (int) ($p['time_per_player'] ?? 120));
$index = cluedo_find_token_in_queue($p['queue'], (string) $token);

if ($joinIntent && $index === null) {
  $otherEngagement = cluedo_find_token_engagement($data, (string) $id, (string) $token, $now, $MAX_WAIT, $timePerPlayer);
  if ($otherEngagement !== null && !$forceSwitch) {
    $data[$id] = $p;
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    echo json_encode([
      'state' => 'already_in_queue',
      'can_join_after_confirm' => true,
      'personnage' => [
        'id' => (string) $id,
        'nom' => $p['nom'] ?? '',
      ],
      'current_engagement' => [
        'personnage_id' => $otherEngagement['character_id'],
        'personnage_nom' => $otherEngagement['character_name'],
        'state' => $otherEngagement['state'],
      ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  if ($otherEngagement !== null && $forceSwitch) {
    $oldCharacterId = $otherEngagement['character_id'];
    $oldQueue = $otherEngagement['queue'];
    $oldQueue = array_values(array_filter($oldQueue, function ($entry) use ($token) {
      return (string) ($entry['token'] ?? '') !== (string) $token;
    }));
    $data[$oldCharacterId]['queue'] = $oldQueue;
  }
}

if ($index === null) {
  $resolvedTeamName = normalize_team_name($teamNameInput);

  if ($joinIntent) {
    $p['queue'][] = [
      'token' => $token,
      'team' => $resolvedTeamName,
      'joined_at' => $resolvedTeamName !== '' ? $now : null,
      'created_at' => $now,
    ];
    $index = count($p['queue']) - 1;
  }
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

$buffer = max(0, (int) ($p['buffer_before_next'] ?? 15));

$visibleQueue = $p['queue'];
$teamNeedsName = $resolvedTeamName === '';

$activeRemainingBeforeTakeover = null;
$firstWaitingEta = null;

$visibleQueue = cluedo_apply_runtime_handover($visibleQueue, $now, $timePerPlayer);

if (isset($visibleQueue[0])) {
  $activeStartedAt = (int) ($visibleQueue[0]['joined_at'] ?? $now);
  $activeElapsed = max(0, $now - $activeStartedAt);
  $activeReservedRemaining = max(0, $timePerPlayer - $activeElapsed);
  $activeRemainingBeforeTakeover = $activeReservedRemaining;
  $firstWaitingEta = $activeReservedRemaining;
}

$visibleIndex = null;
foreach ($visibleQueue as $i => $entry) {
  if (($entry['token'] ?? null) === $token) {
    $visibleIndex = $i;
    break;
  }
}

$inQueue = $visibleIndex !== null;
$canAccess = $inQueue && !$teamNeedsName && $visibleIndex === 0;

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
$state = !$inQueue
  ? 'free'
  : ($teamNeedsName ? 'need_name' : ($canAccess ? 'active' : 'waiting'));
$legacyState = $canAccess ? 'done' : 'waiting';

$p['queue'] = $visibleQueue;
$p['handover'] = null;

$data[$id] = $p;
rewind($fp);
ftruncate($fp, 0);
fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

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
  'in_queue' => $inQueue,
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
