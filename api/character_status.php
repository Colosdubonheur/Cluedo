<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_queue_runtime.php';
require_once __DIR__ . '/_character_visibility.php';
require_once __DIR__ . '/_supervision_messages_store.php';
require_once __DIR__ . '/_team_profiles_store.php';

function cluedo_build_character_game_overview(array $data, int $now, array $profilesStore): array
{
  $maxWait = 600;
  $characters = [];
  $teamsByToken = [];

  foreach ($data as $characterId => $character) {
    if (!cluedo_character_is_active($character)) {
      continue;
    }

    $queue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
    $queue = cluedo_clean_character_queue($queue, $now, $maxWait);
    $timePerPlayer = max(1, (int) ($character['time_per_player'] ?? 120));
    $queue = cluedo_apply_runtime_handover($queue, $now, $timePerPlayer);

    $activeTeamName = '';
    $waitingTeamNames = [];

    foreach ($queue as $index => $entry) {
      $teamName = trim((string) ($entry['team'] ?? ''));
      if ($teamName === '') {
        $teamName = 'Équipe sans nom';
      }

      $token = trim((string) ($entry['token'] ?? ''));
      if ($token !== '' && !isset($teamsByToken[$token])) {
        $teamsByToken[$token] = [
          'token' => $token,
          'team_name' => $teamName,
          'state' => $index === 0 ? 'active' : 'waiting',
          'character_name' => (string) ($character['nom'] ?? ''),
        ];
      }

      if ($index === 0) {
        $activeTeamName = $teamName;
      } else {
        $waitingTeamNames[] = $teamName;
      }
    }

    $characters[] = [
      'id' => (string) $characterId,
      'nom' => (string) ($character['nom'] ?? ''),
      'active_team_name' => $activeTeamName,
      'waiting_team_names' => $waitingTeamNames,
    ];

    $data[$characterId]['queue'] = $queue;
  }

  $profileTeams = isset($profilesStore['teams']) && is_array($profilesStore['teams']) ? $profilesStore['teams'] : [];
  foreach ($profileTeams as $token => $profile) {
    $token = trim((string) $token);
    if ($token === '' || isset($teamsByToken[$token])) {
      continue;
    }

    $teamName = trim((string) ($profile['team_name'] ?? ''));
    if ($teamName === '') {
      $teamName = 'Équipe sans nom';
    }

    $teamsByToken[$token] = [
      'token' => $token,
      'team_name' => $teamName,
      'state' => 'free',
      'character_name' => '',
    ];
  }

  usort($characters, function ($a, $b) {
    return strcasecmp((string) ($a['nom'] ?? ''), (string) ($b['nom'] ?? ''));
  });

  $teams = array_values($teamsByToken);
  usort($teams, function ($a, $b) {
    return strcasecmp((string) ($a['team_name'] ?? ''), (string) ($b['team_name'] ?? ''));
  });

  return [
    'characters' => $characters,
    'teams' => $teams,
  ];
}

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
$profilesStore = cluedo_load_team_profiles();

$current = null;
$waiting = [];

if (isset($queue[0])) {
  $activeToken = (string) ($queue[0]['token'] ?? '');
  $activeProfile = cluedo_get_team_profile($profilesStore, $activeToken);
  $activePlayers = array_values(array_filter(array_map(function ($name) {
    return trim((string) $name);
  }, isset($activeProfile['players']) && is_array($activeProfile['players']) ? $activeProfile['players'] : []), function ($name) {
    return $name !== '';
  }));

  $elapsed = max(0, $now - (int) ($queue[0]['joined_at'] ?? $now));
  $remaining = max(0, $timePerPlayer - $elapsed);
  $current = [
    'token' => $activeToken,
    'team' => (string) ($queue[0]['team'] ?? ''),
    'remaining_seconds' => $remaining,
    'state' => 'active',
    'players' => $activePlayers,
    'photo' => (string) ($activeProfile['photo'] ?? ''),
    'incomplete_team_penalty' => !empty($activeProfile['incomplete_team_penalty']),
  ];
}

for ($i = 1; $i < count($queue); $i++) {
  $waitingToken = (string) ($queue[$i]['token'] ?? '');
  $waitingProfile = cluedo_get_team_profile($profilesStore, $waitingToken);
  $waitingPlayers = array_values(array_filter(array_map(function ($name) {
    return trim((string) $name);
  }, isset($waitingProfile['players']) && is_array($waitingProfile['players']) ? $waitingProfile['players'] : []), function ($name) {
    return $name !== '';
  }));

  $waiting[] = [
    'token' => $waitingToken,
    'team' => (string) ($queue[$i]['team'] ?? ''),
    'position' => $i,
    'participants_count' => count($waitingPlayers),
    'estimated_seconds' => (($current ? ($current['remaining_seconds'] + $buffer) : 0) + ($i - 1) * $timePerPlayer),
    'state' => 'waiting',
  ];
}

$messagesStore = cluedo_load_supervision_messages();
$characterMessage = cluedo_resolve_character_message($messagesStore, (string) $id);

$data[$id]['queue'] = $queue;
$gameOverview = cluedo_build_character_game_overview($data, $now, $profilesStore);
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode([
  'ok' => true,
  'character' => [
    'id' => (string) $id,
    'nom' => (string) ($p['nom'] ?? ''),
    'time_per_player' => $timePerPlayer,
    'buffer_before_next' => $buffer,
    'photo' => (string) ($p['photo'] ?? ''),
    'location' => (string) ($p['location'] ?? ''),
  ],
  'current' => $current,
  'queue' => $waiting,
  'game_overview' => $gameOverview,
  'message' => $characterMessage,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
