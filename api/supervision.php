<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';

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

$now = time();
$maxWait = 600;
$currentStates = [];

foreach ($data as $characterId => $character) {
  $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
  $queue = cluedo_clean_character_queue($queue, $now, $maxWait);

  $timePerPlayer = max(1, (int) ($character['time_per_player'] ?? 120));
  $queue = cluedo_apply_runtime_handover($queue, $now, $timePerPlayer);

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
    ];
  }

  $data[$characterId]['queue'] = $queue;
}

$historyStore = cluedo_load_history();
$teamHistory = $historyStore['teams'];

$knownTokens = array_unique(array_merge(array_keys($teamHistory), array_keys($currentStates)));
$teamsPayload = [];

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
    $start = (int) ($passage['started_at'] ?? 0);
    $end = (int) ($passage['ended_at'] ?? $start);
    $duration = max(0, $end - $start);
    $characterName = (string) ($passage['personnage_nom'] ?? '');

    $historyRows[] = [
      'personnage' => [
        'id' => (string) ($passage['personnage_id'] ?? ''),
        'nom' => $characterName,
      ],
      'started_at' => $start,
      'ended_at' => $end,
      'duration_seconds' => $duration,
    ];

    $key = ((string) ($passage['personnage_id'] ?? '')) . '|' . $characterName;
    if (!isset($characterTotals[$key])) {
      $characterTotals[$key] = [
        'personnage' => [
          'id' => (string) ($passage['personnage_id'] ?? ''),
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

  $teamsPayload[] = [
    'token' => (string) $token,
    'team_name' => (string) ($teamHistory[$token]['team_name'] ?? ''),
    'state' => $state,
    'current_personnage' => $activeCharacter,
    'waiting_queue' => $waitingQueue,
    'queue_position' => $stateInfo['queue_position'] ?? null,
    'history' => $historyRows,
    'time_per_personnage' => array_values($characterTotals),
  ];
}

usort($teamsPayload, function ($a, $b) {
  return strcasecmp((string) ($a['team_name'] ?? ''), (string) ($b['team_name'] ?? ''));
});

$historyStore['teams'] = $teamHistory;
cluedo_save_history($historyStore);
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true, 'teams' => $teamsPayload], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
