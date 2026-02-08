<?php
header('Content-Type: application/json; charset=utf-8');

$id = $_GET['id'] ?? null;
$token = $_GET['token'] ?? null;
$team = trim((string) ($_GET['team'] ?? ''));

if (!$id || !$token) {
  echo json_encode(["error" => "missing id or token"]);
  exit;
}

if ($team === '') {
  $team = 'Equipe sans nom';
}

$path = __DIR__ . '/../data/personnages.json';
$data = json_decode(file_get_contents($path), true);

if (!isset($data[$id])) {
  echo json_encode(["error" => "unknown id"]);
  exit;
}

$p = $data[$id];
$now = time();

/*
   1) Initialisation de la file si absente
*/
if (!isset($p['queue']) || !is_array($p['queue'])) {
  $p['queue'] = [];
}

/*
   2) Nettoyage des joueurs trop anciens (securite)
*/
$MAX_WAIT = 600; // 10 minutes
$p['queue'] = array_values(array_filter($p['queue'], function ($q) use ($now, $MAX_WAIT) {
  return isset($q['joined_at']) && ($now - $q['joined_at']) < $MAX_WAIT;
}));

/*
   3) Ajouter le joueur a la file s'il n'y est pas
*/
$index = null;
foreach ($p['queue'] as $i => $q) {
  if (($q['token'] ?? null) === $token) {
    $index = $i;
    break;
  }
}

if ($index === null) {
  $p['queue'][] = [
    "token" => $token,
    "team" => $team,
    "joined_at" => $now,
  ];
  $index = count($p['queue']) - 1;
} else {
  // Permet de completer les anciennes entrees sans nom d'equipe.
  $p['queue'][$index]['team'] = $team;
}

/*
   4) Calcul du temps d'attente
*/
$timePerPlayer = (int) ($p['time_per_player'] ?? 120);
$buffer = (int) ($p['buffer_before_next'] ?? 15);

$first = $p['queue'][0] ?? ["joined_at" => $now];
$elapsedFirst = $now - ($first['joined_at'] ?? $now);
$remainingFirst = max(0, $timePerPlayer - $elapsedFirst);

$wait = 0;

// Si quelqu'un est avant moi
if ($index > 0) {
  $wait += $remainingFirst;
  $wait += ($index - 1) * $timePerPlayer;
  // Tampon obligatoire avant passage
  $wait += $buffer;
}

$canAccess = ($index === 0);
$myRemaining = $canAccess ? $remainingFirst : 0;
$previousTeam = $index > 0 ? (string) ($p['queue'][$index - 1]['team'] ?? '') : '';

/*
   5) Sauvegarde
*/
$data[$id] = $p;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

/*
   6) Reponse JSON (une seule sortie)
*/
$response = [
  "id" => $id,
  "nom" => $p['nom'],
  "photo" => $p['photo'] ?? "",
  "position" => $index,
  "queue_length" => count($p['queue']),
  "wait_remaining" => max(0, $wait),
  "time_per_player" => $timePerPlayer,
  "buffer_before_next" => $buffer,
  "can_access" => $canAccess,
  "my_remaining" => $myRemaining,
  "previous_team" => $previousTeam,
];

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
  "position" => $index,
  "queue_length" => count($p['queue']),
  "wait_remaining" => max(0, $wait),
  "time_per_player" => $timePerPlayer,
  "buffer_before_next" => $buffer
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
