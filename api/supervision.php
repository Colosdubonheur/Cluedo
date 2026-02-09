<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_character_visibility.php';
require_once __DIR__ . '/_team_profiles_store.php';
require_once __DIR__ . '/_supervision_messages_store.php';
require_once __DIR__ . '/_game_state_store.php';
require_once __DIR__ . '/_team_presence_store.php';
require_once __DIR__ . '/_deleted_team_tokens_store.php';
require_once __DIR__ . '/_auth.php';

cluedo_require_admin_pin();

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
  $channel = trim((string) ($_POST['channel'] ?? ''));
  $rawTargets = $_POST['targets'] ?? null;
  $singleTarget = trim((string) ($_POST['target'] ?? ''));
  $message = trim((string) ($_POST['message'] ?? ''));

  if ($message === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'message vide'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  if ($channel !== 'team' && $channel !== 'character') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'canal invalide'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  $targets = [];
  if (is_array($rawTargets)) {
    foreach ($rawTargets as $target) {
      $targetValue = trim((string) $target);
      if ($targetValue !== '') {
        $targets[] = $targetValue;
      }
    }
  }

  if (!$targets && $singleTarget !== '') {
    $targets[] = $singleTarget;
  }

  $targets = array_values(array_unique($targets));
  if (!$targets) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'aucun destinataire sélectionné'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  $messages = cluedo_load_supervision_messages();
  $payload = [
    'text' => substr($message, 0, 300),
    'created_at' => time(),
  ];

  foreach ($targets as $target) {
    if ($channel === 'team') {
      if ($target === 'teams:all') {
        $messages['team_broadcast'] = $payload;
        continue;
      }

      if (str_starts_with($target, 'team:')) {
        $teamToken = substr($target, strlen('team:'));
        if ($teamToken === '') {
          http_response_code(400);
          echo json_encode(['ok' => false, 'error' => 'destinataire équipe invalide'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
          exit;
        }
        $messages['teams'][$teamToken] = $payload;
        continue;
      }

      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'destinataire invalide pour le canal équipe'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      exit;
    }

    if ($target === 'characters:all') {
      $messages['character_broadcast'] = $payload;
      continue;
    }

    if (str_starts_with($target, 'character:')) {
      $characterId = substr($target, strlen('character:'));
      if ($characterId === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'destinataire personnage invalide'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
      }
      $messages['characters'][$characterId] = $payload;
      continue;
    }

    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'destinataire invalide pour le canal personnage'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  cluedo_save_supervision_messages($messages);

  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method === 'POST' && $action === 'clear_messages_history') {
  $cleared = cluedo_clear_supervision_messages_history();
  if (!$cleared) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'suppression des messages impossible'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  echo json_encode(['ok' => true, 'messages_cleared' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}


if ($method === 'POST' && $action === 'reset_game') {
  $lockPath = __DIR__ . '/../data/.runtime_reset_game.lock';
  $lockHandle = fopen($lockPath, 'c');
  if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
    if (is_resource($lockHandle)) {
      fclose($lockHandle);
    }
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'verrou runtime indisponible'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  try {
    $dataPath = cluedo_data_path();
    $data = json_decode((string) file_get_contents($dataPath), true);
    if (!is_array($data)) {
      $data = [];
    }

    foreach ($data as $characterId => $character) {
      if (!is_array($character)) {
        continue;
      }
      $data[$characterId]['queue'] = [];
    }

    file_put_contents($dataPath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    cluedo_save_history(['teams' => []]);
    cluedo_save_team_profiles(['teams' => []]);
    cluedo_save_team_presence(['teams' => []]);
    cluedo_clear_supervision_messages_history();
    cluedo_save_deleted_team_tokens(['tokens' => []]);

    $uploadsDir = realpath(__DIR__ . '/../uploads');
    if ($uploadsDir !== false) {
      $files = scandir($uploadsDir);
      if (is_array($files)) {
        foreach ($files as $file) {
          if ($file === '.' || $file === '..' || $file === '.gitkeep') {
            continue;
          }
          $absolutePath = $uploadsDir . DIRECTORY_SEPARATOR . $file;
          if (is_file($absolutePath)) {
            @unlink($absolutePath);
          }
        }
      }
    }

    cluedo_save_game_state([
      'end_game_active' => false,
      'updated_at' => time(),
    ]);
  } finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
  }

  echo json_encode([
    'ok' => true,
    'reset' => true,
    'game_state' => cluedo_load_game_state(),
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method === 'POST' && $action === 'reset_history') {
  cluedo_save_history(['teams' => []]);
  echo json_encode(['ok' => true, 'reset' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method === 'POST' && $action === 'set_end_game') {
  $active = (string) ($_POST['active'] ?? '') === '1';
  cluedo_save_game_state([
    'end_game_active' => $active,
    'updated_at' => time(),
  ]);

  echo json_encode([
    'ok' => true,
    'game_state' => cluedo_load_game_state(),
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method === 'POST' && $action === 'delete_team') {
  $token = trim((string) ($_POST['token'] ?? ''));
  if ($token === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'token équipe manquant'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  $lockPath = __DIR__ . '/../data/.runtime_delete_team.lock';
  $lockHandle = fopen($lockPath, 'c');
  if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
    if (is_resource($lockHandle)) {
      fclose($lockHandle);
    }
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'verrou runtime indisponible'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  $removedQueueEntries = 0;
  $removedHistory = false;
  $removedProfile = false;
  $removedPresence = false;
  $removedMessage = false;
  $photoDeleted = false;

  try {
    $dataPath = cluedo_data_path();
    $data = json_decode((string) file_get_contents($dataPath), true);
    if (!is_array($data)) {
      $data = [];
    }

    foreach ($data as $characterId => $character) {
      if (!isset($character['queue']) || !is_array($character['queue'])) {
        continue;
      }

      $queue = $character['queue'];
      $initialCount = count($queue);
      $queue = array_values(array_filter($queue, function ($entry) use ($token) {
        return (string) ($entry['token'] ?? '') !== $token;
      }));

      $removedQueueEntries += max(0, $initialCount - count($queue));
      $data[$characterId]['queue'] = $queue;
    }

    $historyStore = cluedo_load_history();
    if (isset($historyStore['teams'][$token])) {
      unset($historyStore['teams'][$token]);
      $removedHistory = true;
    }

    $profilesStore = cluedo_load_team_profiles();
    $profile = cluedo_get_team_profile($profilesStore, $token);
    $photoPath = trim((string) ($profile['photo'] ?? ''));
    if (isset($profilesStore['teams'][$token])) {
      unset($profilesStore['teams'][$token]);
      $removedProfile = true;
    }

    $presenceStore = cluedo_load_team_presence();
    if (isset($presenceStore['teams'][$token])) {
      unset($presenceStore['teams'][$token]);
      $removedPresence = true;
    }

    $messagesStore = cluedo_load_supervision_messages();
    if (isset($messagesStore['teams'][$token])) {
      unset($messagesStore['teams'][$token]);
      $removedMessage = true;
    }

    file_put_contents($dataPath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    cluedo_save_history($historyStore);
    cluedo_save_team_profiles($profilesStore);
    cluedo_save_team_presence($presenceStore);
    cluedo_save_supervision_messages($messagesStore);
    cluedo_mark_team_token_deleted($token);

    if ($photoPath !== '' && str_starts_with($photoPath, 'uploads/')) {
      $uploadsDir = realpath(__DIR__ . '/../uploads');
      $absolutePhotoPath = realpath(__DIR__ . '/../' . $photoPath);
      if ($uploadsDir !== false && $absolutePhotoPath !== false && str_starts_with($absolutePhotoPath, $uploadsDir . DIRECTORY_SEPARATOR) && is_file($absolutePhotoPath)) {
        $photoDeleted = @unlink($absolutePhotoPath);
      }
    }
  } finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
  }

  echo json_encode([
    'ok' => true,
    'deleted_token' => $token,
    'removed_queue_entries' => $removedQueueEntries,
    'removed_history' => $removedHistory,
    'removed_profile' => $removedProfile,
    'removed_presence' => $removedPresence,
    'removed_message' => $removedMessage,
    'photo_deleted' => $photoDeleted,
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
      'state_since' => (int) ($entry['joined_at'] ?? $now),
      'personnage' => [
        'id' => (string) $characterId,
        'nom' => (string) ($character['nom'] ?? ''),
      ],
      'queue_position' => $index,
      'queue_length' => count($queue),
      'active_remaining_seconds' => $index === 0 ? $activeRemainingSeconds : null,
      'has_waiting_queue' => $index === 0 ? $hasWaitingQueue : null,
    ];
  }

  $data[$characterId]['queue'] = $queue;
}

$historyStore = cluedo_load_history();
$teamHistory = $historyStore['teams'];

$teamsPayload = [];
$profilesStore = cluedo_load_team_profiles();
$messagesStore = cluedo_load_supervision_messages();
$presenceStore = cluedo_load_team_presence();
$profileTokens = isset($profilesStore['teams']) && is_array($profilesStore['teams']) ? array_keys($profilesStore['teams']) : [];
$presenceTokens = isset($presenceStore['teams']) && is_array($presenceStore['teams']) ? array_keys($presenceStore['teams']) : [];
$knownTokens = array_unique(array_merge(array_keys($teamHistory), array_keys($currentStates), $profileTokens, $presenceTokens));

foreach ($knownTokens as $token) {
  if (!isset($teamHistory[$token]) || !is_array($teamHistory[$token])) {
    $teamHistory[$token] = ['team_name' => '', 'current' => null, 'history' => []];
  }

  if (!isset($teamHistory[$token]['history']) || !is_array($teamHistory[$token]['history'])) {
    $teamHistory[$token]['history'] = [];
  }

  $stateInfo = $currentStates[$token] ?? null;
  $profile = cluedo_get_team_profile($profilesStore, (string) $token);
  if ($stateInfo !== null && trim((string) $stateInfo['team_name']) !== '') {
    $teamHistory[$token]['team_name'] = (string) $stateInfo['team_name'];
  }

  if (trim((string) ($teamHistory[$token]['team_name'] ?? '')) === '' && trim((string) ($profile['team_name'] ?? '')) !== '') {
    $teamHistory[$token]['team_name'] = (string) $profile['team_name'];
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

  $currentPassage = is_array($teamHistory[$token]['current'] ?? null) ? $teamHistory[$token]['current'] : null;
  if ($currentPassage !== null) {
    $currentCharacterId = (string) ($currentPassage['personnage_id'] ?? '');
    if ($currentCharacterId !== '' && isset($activeCharacterIds[$currentCharacterId])) {
      $currentCharacterName = (string) ($currentPassage['personnage_nom'] ?? '');
      $currentStartedAt = (int) ($currentPassage['started_at'] ?? $now);
      $currentDuration = max(0, $now - $currentStartedAt);
      $key = $currentCharacterId . '|' . $currentCharacterName;

      if (!isset($characterTotals[$key])) {
        $characterTotals[$key] = [
          'personnage' => [
            'id' => $currentCharacterId,
            'nom' => $currentCharacterName,
          ],
          'duration_seconds' => 0,
        ];
      }

      $characterTotals[$key]['duration_seconds'] += $currentDuration;
    }
  }

  $seenThresholdSeconds = 30;

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

  $seenByCharacter = [];
  foreach ($characterTotals as $entry) {
    $characterId = (string) ($entry['personnage']['id'] ?? '');
    $characterName = (string) ($entry['personnage']['nom'] ?? '');
    $duration = (int) ($entry['duration_seconds'] ?? 0);
    if ($characterId === '' || $duration < $seenThresholdSeconds) {
      continue;
    }
    $seenByCharacter[$characterId] = [
      'id' => $characterId,
      'nom' => $characterName,
    ];
  }

  $teamsPayload[] = [
    'token' => (string) $token,
    'team_name' => (string) ($teamHistory[$token]['team_name'] ?? ''),
    'state' => $state,
    'current_personnage' => $activeCharacter,
    'waiting_queue' => $waitingQueue,
    'queue_position' => $stateInfo['queue_position'] ?? null,
    'queue_length' => $stateInfo['queue_length'] ?? 0,
    'state_since' => $stateInfo['state_since'] ?? null,
    'active_remaining_seconds' => $activeRemainingSeconds,
    'has_waiting_queue' => $hasWaitingQueue,
    'takeover_warning' => $takeoverWarning,
    'history' => $historyRows,
    'time_per_personnage' => array_values($characterTotals),
    'players' => $profile['players'],
    'photo' => $profile['photo'],
    'encountered_personnages' => array_values($encounteredByCharacter),
    'seen_personnages' => array_values($seenByCharacter),
    'message' => cluedo_resolve_team_message($messagesStore, (string) $token),
  ];
}

usort($teamsPayload, function ($a, $b) {
  return strcasecmp((string) ($a['team_name'] ?? ''), (string) ($b['team_name'] ?? ''));
});

$historyStore['teams'] = $teamHistory;
cluedo_save_history($historyStore);
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$charactersPayload = [];
foreach ($data as $characterId => $character) {
  if (!cluedo_character_is_active($character)) {
    continue;
  }

  $charactersPayload[] = [
    'id' => (string) $characterId,
    'nom' => (string) ($character['nom'] ?? ''),
  ];
}

usort($charactersPayload, function ($a, $b) {
  return strcasecmp((string) ($a['nom'] ?? ''), (string) ($b['nom'] ?? ''));
});

echo json_encode([
  'ok' => true,
  'teams' => $teamsPayload,
  'characters' => $charactersPayload,
  'game_state' => cluedo_load_game_state(),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
