<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_character_visibility.php';
require_once __DIR__ . '/_team_profiles_store.php';
require_once __DIR__ . '/_supervision_messages_store.php';

function cluedo_history_path(): string
{
  return __DIR__ . '/../data/team_history.json';
}

function cluedo_load_history(): array
{
  $path = cluedo_history_path();
  if (!file_exists($path)) {
    return ['teams' => []];
  }

  $decoded = json_decode((string) file_get_contents($path), true);
  if (!is_array($decoded)) {
    return ['teams' => []];
  }

  if (!isset($decoded['teams']) || !is_array($decoded['teams'])) {
    $decoded['teams'] = [];
  }

  return $decoded;
}

function cluedo_save_history(array $history): void
{
  $path = cluedo_history_path();
  if (!isset($history['teams']) || !is_array($history['teams'])) {
    $history['teams'] = [];
  }

  file_put_contents($path, json_encode($history, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = trim((string) ($_POST['action'] ?? $_GET['action'] ?? ''));


if ($method === 'POST' && $action === 'send_message') {
  $target = trim((string) ($_POST['target'] ?? 'all'));
  $message = trim((string) ($_POST['message'] ?? ''));

  if ($message === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'message vide'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  $messages = cluedo_load_supervision_messages();
  $payload = [
    'text' => substr($message, 0, 300),
    'created_at' => time(),
  ];

  if ($target === 'all') {
    $messages['global'] = $payload;
  } else {
    $messages['teams'][$target] = $payload;
  }

  cluedo_save_supervision_messages($messages);

  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method === 'POST' && $action === 'reset_history') {
  cluedo_save_history(['teams' => []]);
  echo json_encode(['ok' => true, 'reset' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

$path = cluedo_data_path();
$data = json_decode(file_get_contents($path), true);
if (!is_array($data)) {
  $data = [];
}

$changed = cluedo_enforce_character_visibility($data);
$now = time();
$maxWait = 600;
$currentStates = [];
$activeCharacterIds = array_fill_keys(array_map('strval', array_keys(cluedo_get_active_characters($data))), true);

foreach ($data as $characterId => $character) {
  if (!cluedo_character_is_active($character)) {
    continue;
  }
  $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
  $queue = cluedo_clean_character_queue($queue, $now, $maxWait);

  $timePerPlayer = max(1, (int) ($character['time_per_player'] ?? 120));
  $queue = cluedo_apply_runtime_handover($queue, $now, $timePerPlayer);

  $activeRemainingSeconds = null;
  if (isset($queue[0])) {
    $activeStartedAt = (int) ($queue[0]['joined_at'] ?? $now);
    $activeElapsed = max(0, $now - $activeStartedAt);
    $activeRemainingSeconds = max(0, $timePerPlayer - $activeElapsed);
  }
  $hasWaitingQueue = count($queue) > 1;

  foreach ($queue as $index => $entry) {
    $token = (string) ($entry['token'] ?? '');
    if ($token === '' || isset($currentStates[$token])) {
      continue;
    }

    $currentStates[$token] = [
      'token' => $token,
      'team_name' => (string) ($entry['team'] ?? ''),
      'state' => $index === 0 ? 'active' : 'waiting',
      'personnage' => [
        'id' => (string) $characterId,
        'nom' => (string) ($character['nom'] ?? ''),
      ],
      'queue_position' => $index,
      'active_remaining_seconds' => $index === 0 ? $activeRemainingSeconds : null,
      'has_waiting_queue' => $index === 0 ? $hasWaitingQueue : null,
    ];
  }

  $data[$characterId]['queue'] = $queue;
}

$historyStore = cluedo_load_history();
$teamHistory = $historyStore['teams'];

$knownTokens = array_unique(array_merge(array_keys($teamHistory), array_keys($currentStates)));
$teamsPayload = [];
$profilesStore = cluedo_load_team_profiles();
$messagesStore = cluedo_load_supervision_messages();

foreach ($knownTokens as $token) {
  if (!isset($teamHistory[$token]) || !is_array($teamHistory[$token])) {
    $teamHistory[$token] = ['team_name' => '', 'current' => null, 'history' => []];
  }

  if (!isset($teamHistory[$token]['history']) || !is_array($teamHistory[$token]['history'])) {
    $teamHistory[$token]['history'] = [];
  }

  $stateInfo = $currentStates[$token] ?? null;
  if ($stateInfo !== null && trim((string) $stateInfo['team_name']) !== '') {
    $teamHistory[$token]['team_name'] = (string) $stateInfo['team_name'];
  }

  $current = $teamHistory[$token]['current'] ?? null;
  $isActiveNow = $stateInfo !== null && $stateInfo['state'] === 'active';

  if ($isActiveNow) {
    $activeCharacterId = (string) ($stateInfo['personnage']['id'] ?? '');
    $activeCharacterName = (string) ($stateInfo['personnage']['nom'] ?? '');

    if (!is_array($current)) {
      $teamHistory[$token]['current'] = [
        'personnage_id' => $activeCharacterId,
        'personnage_nom' => $activeCharacterName,
        'started_at' => $now,
      ];
    } else {
      $currentCharacterId = (string) ($current['personnage_id'] ?? '');
      if ($currentCharacterId !== $activeCharacterId) {
        $startedAt = (int) ($current['started_at'] ?? $now);
        $teamHistory[$token]['history'][] = [
          'personnage_id' => $currentCharacterId,
          'personnage_nom' => (string) ($current['personnage_nom'] ?? ''),
          'started_at' => $startedAt,
          'ended_at' => $now,
        ];

        $teamHistory[$token]['current'] = [
          'personnage_id' => $activeCharacterId,
          'personnage_nom' => $activeCharacterName,
          'started_at' => $now,
        ];
      }
    }
  } else {
    if (is_array($current)) {
      $startedAt = (int) ($current['started_at'] ?? $now);
      $teamHistory[$token]['history'][] = [
        'personnage_id' => (string) ($current['personnage_id'] ?? ''),
        'personnage_nom' => (string) ($current['personnage_nom'] ?? ''),
        'started_at' => $startedAt,
        'ended_at' => $now,
      ];
      $teamHistory[$token]['current'] = null;
    }
  }

  $historyRows = [];
  $characterTotals = [];

  foreach ($teamHistory[$token]['history'] as $passage) {
    $passageCharacterId = (string) ($passage['personnage_id'] ?? '');
    if ($passageCharacterId === '' || !isset($activeCharacterIds[$passageCharacterId])) {
      continue;
    }

    $start = (int) ($passage['started_at'] ?? 0);
    $end = (int) ($passage['ended_at'] ?? $start);
    $duration = max(0, $end - $start);
    $characterName = (string) ($passage['personnage_nom'] ?? '');

    $historyRows[] = [
      'personnage' => [
        'id' => $passageCharacterId,
        'nom' => $characterName,
      ],
      'started_at' => $start,
      'ended_at' => $end,
      'duration_seconds' => $duration,
    ];

    $key = $passageCharacterId . '|' . $characterName;
    if (!isset($characterTotals[$key])) {
      $characterTotals[$key] = [
        'personnage' => [
          'id' => $passageCharacterId,
          'nom' => $characterName,
        ],
        'duration_seconds' => 0,
      ];
    }

    $characterTotals[$key]['duration_seconds'] += $duration;
  }

  $state = 'free';
  $waitingQueue = null;
  $activeCharacter = null;

  if ($stateInfo !== null) {
    $state = $stateInfo['state'];
    if ($state === 'waiting') {
      $waitingQueue = $stateInfo['personnage'];
    }
    if ($state === 'active') {
      $activeCharacter = $stateInfo['personnage'];
    }
  }

  $activeRemainingSeconds = $stateInfo['active_remaining_seconds'] ?? null;
  $hasWaitingQueue = (bool) ($stateInfo['has_waiting_queue'] ?? false);
  $takeoverWarning = $state === 'active' && $hasWaitingQueue && $activeRemainingSeconds !== null && (int) $activeRemainingSeconds <= 15;

  $profile = cluedo_get_team_profile($profilesStore, (string) $token);
  $encounteredByCharacter = [];
  foreach ($historyRows as $row) {
    $characterId = (string) ($row['personnage']['id'] ?? '');
    if ($characterId === '' || isset($encounteredByCharacter[$characterId])) {
      continue;
    }
    $encounteredByCharacter[$characterId] = [
      'id' => $characterId,
      'nom' => (string) ($row['personnage']['nom'] ?? ''),
    ];
  }

  $teamsPayload[] = [
    'token' => (string) $token,
    'team_name' => (string) ($teamHistory[$token]['team_name'] ?? ''),
    'state' => $state,
    'current_personnage' => $activeCharacter,
    'waiting_queue' => $waitingQueue,
    'queue_position' => $stateInfo['queue_position'] ?? null,
    'active_remaining_seconds' => $activeRemainingSeconds,
    'has_waiting_queue' => $hasWaitingQueue,
    'takeover_warning' => $takeoverWarning,
    'history' => $historyRows,
    'time_per_personnage' => array_values($characterTotals),
    'players' => $profile['players'],
    'photo' => $profile['photo'],
    'encountered_personnages' => array_values($encounteredByCharacter),
    'message' => cluedo_resolve_team_message($messagesStore, (string) $token),
  ];
}

usort($teamsPayload, function ($a, $b) {
  return strcasecmp((string) ($a['team_name'] ?? ''), (string) ($b['team_name'] ?? ''));
});

$historyStore['teams'] = $teamHistory;
cluedo_save_history($historyStore);
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true, 'teams' => $teamsPayload], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
