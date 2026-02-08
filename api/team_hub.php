<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_team_profiles_store.php';
require_once __DIR__ . '/_character_visibility.php';
require_once __DIR__ . '/_supervision_messages_store.php';
require_once __DIR__ . '/_game_state_store.php';

$token = trim((string) ($_GET['token'] ?? ''));
if ($token === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing token']);
  exit;
}

$dataPath = cluedo_data_path();
$data = json_decode((string) file_get_contents($dataPath), true);
if (!is_array($data)) {
  $data = [];
}

$changed = cluedo_enforce_character_visibility($data);

$historyPath = __DIR__ . '/../data/team_history.json';
$history = ['teams' => []];
if (file_exists($historyPath)) {
  $decodedHistory = json_decode((string) file_get_contents($historyPath), true);
  if (is_array($decodedHistory)) {
    $history = $decodedHistory;
  }
}
if (!isset($history['teams']) || !is_array($history['teams'])) {
  $history['teams'] = [];
}

$profilesStore = cluedo_load_team_profiles();
$profile = cluedo_get_team_profile($profilesStore, $token);

$now = time();
$maxWait = 600;
$teamState = [
  'state' => 'free',
  'character_id' => null,
  'character_name' => null,
  'position' => null,
  'queue_total' => null,
];
$global = [];
$activeCharacterIds = array_fill_keys(array_map('strval', array_keys(cluedo_get_active_characters($data))), true);

foreach ($data as $characterId => $character) {
  if (!cluedo_character_is_active($character)) {
    continue;
  }
  $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
  $queue = cluedo_clean_character_queue($queue, $now, $maxWait);
  $timePerPlayer = max(1, (int) ($character['time_per_player'] ?? 120));
  $queue = cluedo_apply_runtime_handover($queue, $now, $timePerPlayer);

  $data[$characterId]['queue'] = $queue;

  $activeTeamName = '';
  $activeRemaining = 0;
  if (isset($queue[0])) {
    $activeTeamName = trim((string) ($queue[0]['team'] ?? ''));
    $activeStartedAt = (int) ($queue[0]['joined_at'] ?? $now);
    $activeElapsed = max(0, $now - $activeStartedAt);
    $activeRemaining = max(0, $timePerPlayer - $activeElapsed);
  }

  $waitingCount = max(0, count($queue) - 1);
  $estimatedWait = $activeRemaining;
  if ($waitingCount > 1) {
    $estimatedWait += ($waitingCount - 1) * $timePerPlayer;
  }

  foreach ($queue as $index => $entry) {
    if ((string) ($entry['token'] ?? '') !== $token) {
      continue;
    }

    $teamState = [
      'state' => $index === 0 ? 'active' : 'waiting',
      'character_id' => (string) $characterId,
      'character_name' => (string) ($character['nom'] ?? ''),
      'position' => (int) $index,
      'queue_total' => count($queue),
    ];
    break;
  }

  $global[] = [
    'id' => (string) $characterId,
    'nom' => (string) ($character['nom'] ?? ''),
    'location' => (string) ($character['location'] ?? ''),
    'photo' => (string) ($character['photo'] ?? ''),
    'state' => count($queue) > 0 ? 'queue' : 'available',
    'queue_total' => count($queue),
    'active_team_name' => $activeTeamName,
    'waiting_count' => $waitingCount,
    'estimated_wait_seconds' => $estimatedWait,
    'is_current_team_engagement' => $teamState['character_id'] === (string) $characterId,
  ];
}

file_put_contents($dataPath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$teamHistory = $history['teams'][$token] ?? ['history' => []];
$rows = isset($teamHistory['history']) && is_array($teamHistory['history']) ? $teamHistory['history'] : [];
$rows = array_values(array_filter($rows, function ($row) {
  return isset($row['personnage']) && is_array($row['personnage']);
}));

$totalsByCharacter = [];
foreach ($rows as $row) {
  $character = $row['personnage'];
  $characterId = (string) ($character['id'] ?? '');
  if ($characterId === '' || !isset($activeCharacterIds[$characterId])) {
    continue;
  }

  if (!isset($totalsByCharacter[$characterId])) {
    $totalsByCharacter[$characterId] = [
      'id' => $characterId,
      'nom' => (string) ($character['nom'] ?? ''),
      'duration_seconds' => 0,
    ];
  }

  $totalsByCharacter[$characterId]['duration_seconds'] += max(0, (int) ($row['duration_seconds'] ?? 0));
}

$recap = array_values($totalsByCharacter);
usort($recap, function ($a, $b) {
  return strcmp($a['id'], $b['id']);
});

$messagesStore = cluedo_load_supervision_messages();
$teamMessage = cluedo_resolve_team_message($messagesStore, $token);

echo json_encode([
  'ok' => true,
  'team' => [
    'token' => $token,
    'state' => $teamState,
    'profile' => $profile,
    'history' => $recap,
    'message' => $teamMessage,
  ],
  'global' => $global,
  'game_state' => cluedo_load_game_state(),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
