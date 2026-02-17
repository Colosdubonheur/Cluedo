<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_team_profiles_store.php';
require_once __DIR__ . '/_character_visibility.php';
require_once __DIR__ . '/_supervision_messages_store.php';
require_once __DIR__ . '/_game_state_store.php';
require_once __DIR__ . '/_team_presence_store.php';
require_once __DIR__ . '/_deleted_team_tokens_store.php';

$token = trim((string) ($_GET['token'] ?? ''));
if ($token === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing token']);
  exit;
}

if (cluedo_is_team_token_deleted($token)) {
  echo json_encode([
    'ok' => true,
    'team' => [
      'token' => $token,
      'token_invalidated' => true,
      'state' => [
        'state' => 'free',
        'character_id' => null,
        'character_name' => null,
        'position' => null,
        'queue_total' => null,
      ],
      'profile' => [
        'team_name' => '',
        'players' => [],
        'photo' => '',
        'score' => 0,
      ],
      'history' => [],
      'message' => ['text' => '', 'created_at' => 0],
      'is_new_team_session' => true,
    ],
    'global' => [],
    'game_state' => cluedo_load_game_state(),
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function cluedo_team_hub_history_path(): string
{
  return __DIR__ . '/../data/team_history.json';
}

function cluedo_team_hub_load_history(): array
{
  $path = cluedo_team_hub_history_path();
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

function cluedo_team_hub_save_history(array $history): void
{
  if (!isset($history['teams']) || !is_array($history['teams'])) {
    $history['teams'] = [];
  }

  file_put_contents(cluedo_team_hub_history_path(), json_encode($history, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$history = cluedo_team_hub_load_history();
$profilesStore = cluedo_load_team_profiles();
$profile = cluedo_get_team_profile($profilesStore, $token);
$messagesStore = cluedo_load_supervision_messages();
$teamMessage = cluedo_resolve_team_message($messagesStore, $token);

$now = time();
$presenceEntry = cluedo_touch_team_presence($token, $now);
$isNewTeamSession = !empty($presenceEntry['is_new']);
$teamState = [
  'state' => 'free',
  'character_id' => null,
  'character_name' => null,
  'position' => null,
  'queue_total' => null,
];
$global = [];
$teamActiveStartedAt = null;
$activeCharacterIds = [];

cluedo_update_characters_data(function (array $data) use ($token, $now, &$teamState, &$global, &$teamActiveStartedAt, &$activeCharacterIds): array {
  cluedo_enforce_character_visibility($data);

  $maxWait = 600;
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
    $tokenQueueIndex = null;
    foreach ($queue as $queueIndex => $entry) {
      if ((string) ($entry['token'] ?? '') === $token) {
        $tokenQueueIndex = (int) $queueIndex;
        break;
      }
    }

    if ($tokenQueueIndex === 0) {
      $estimatedWait = 0;
    } elseif ($tokenQueueIndex !== null) {
      $estimatedWait = $activeRemaining + max(0, ($tokenQueueIndex - 1) * $timePerPlayer);
    } else {
      $estimatedWait = $activeRemaining + ($waitingCount * $timePerPlayer);
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
      if ($index === 0) {
        $teamActiveStartedAt = (int) ($entry['joined_at'] ?? $now);
      }
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

  return $data;
});

if (!isset($history['teams'][$token]) || !is_array($history['teams'][$token])) {
  $history['teams'][$token] = ['team_name' => '', 'current' => null, 'history' => []];
}
if (!isset($history['teams'][$token]['history']) || !is_array($history['teams'][$token]['history'])) {
  $history['teams'][$token]['history'] = [];
}

$teamHistoryRow = $history['teams'][$token];
$current = is_array($teamHistoryRow['current'] ?? null) ? $teamHistoryRow['current'] : null;
$isActiveNow = $teamState['state'] === 'active' && (string) ($teamState['character_id'] ?? '') !== '';

if ($isActiveNow) {
  $activeCharacterId = (string) $teamState['character_id'];
  $activeCharacterName = (string) ($teamState['character_name'] ?? '');
  $startedAt = max(0, (int) ($teamActiveStartedAt ?? $now));

  if (!is_array($current)) {
    $teamHistoryRow['current'] = [
      'personnage_id' => $activeCharacterId,
      'personnage_nom' => $activeCharacterName,
      'started_at' => $startedAt,
    ];
  } else {
    $currentCharacterId = (string) ($current['personnage_id'] ?? '');
    if ($currentCharacterId !== $activeCharacterId) {
      $previousStartedAt = (int) ($current['started_at'] ?? $now);
      $teamHistoryRow['history'][] = [
        'personnage_id' => $currentCharacterId,
        'personnage_nom' => (string) ($current['personnage_nom'] ?? ''),
        'started_at' => $previousStartedAt,
        'ended_at' => $now,
      ];
      $teamHistoryRow['current'] = [
        'personnage_id' => $activeCharacterId,
        'personnage_nom' => $activeCharacterName,
        'started_at' => $startedAt,
      ];
    } elseif ((int) ($current['started_at'] ?? 0) <= 0 || $startedAt < (int) ($current['started_at'] ?? 0)) {
      $teamHistoryRow['current']['started_at'] = $startedAt;
    }
  }
} elseif (is_array($current)) {
  $startedAt = (int) ($current['started_at'] ?? $now);
  $teamHistoryRow['history'][] = [
    'personnage_id' => (string) ($current['personnage_id'] ?? ''),
    'personnage_nom' => (string) ($current['personnage_nom'] ?? ''),
    'started_at' => $startedAt,
    'ended_at' => $now,
  ];
  $teamHistoryRow['current'] = null;
}

$history['teams'][$token] = $teamHistoryRow;
cluedo_team_hub_save_history($history);

$teamHistory = $history['teams'][$token] ?? ['history' => [], 'current' => null];
$rows = isset($teamHistory['history']) && is_array($teamHistory['history']) ? $teamHistory['history'] : [];
$rows = array_values(array_filter($rows, function ($row) {
  return is_array($row) && trim((string) ($row['personnage_id'] ?? '')) !== '';
}));

$totalsByCharacter = [];
foreach ($rows as $row) {
  $characterId = (string) ($row['personnage_id'] ?? '');
  if ($characterId === '' || !isset($activeCharacterIds[$characterId])) {
    continue;
  }

  $startedAt = (int) ($row['started_at'] ?? 0);
  $endedAt = (int) ($row['ended_at'] ?? $startedAt);
  $duration = max(0, $endedAt - $startedAt);

  if (!isset($totalsByCharacter[$characterId])) {
    $totalsByCharacter[$characterId] = [
      'id' => $characterId,
      'nom' => (string) ($row['personnage_nom'] ?? ''),
      'duration_seconds' => 0,
    ];
  }

  $totalsByCharacter[$characterId]['duration_seconds'] += $duration;
}

$currentPassage = is_array($teamHistory['current'] ?? null) ? $teamHistory['current'] : null;
if ($currentPassage !== null) {
  $characterId = (string) ($currentPassage['personnage_id'] ?? '');
  if ($characterId !== '' && isset($activeCharacterIds[$characterId])) {
    if (!isset($totalsByCharacter[$characterId])) {
      $totalsByCharacter[$characterId] = [
        'id' => $characterId,
        'nom' => (string) ($currentPassage['personnage_nom'] ?? ''),
        'duration_seconds' => 0,
      ];
    }

    $startedAt = (int) ($currentPassage['started_at'] ?? $now);
    $totalsByCharacter[$characterId]['duration_seconds'] += max(0, $now - $startedAt);
  }
}

$recap = array_values($totalsByCharacter);
usort($recap, function ($a, $b) {
  return strcmp($a['id'], $b['id']);
});

echo json_encode([
  'ok' => true,
  'team' => [
    'token' => $token,
    'state' => $teamState,
    'profile' => $profile,
    'history' => $recap,
    'message' => $teamMessage,
    'is_new_team_session' => $isNewTeamSession,
  ],
  'global' => $global,
  'game_state' => cluedo_load_game_state(),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
