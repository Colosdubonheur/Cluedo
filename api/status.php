<?php
header('Content-Type: application/json; charset=utf-8');

$id = $_GET['id'] ?? null;
$token = $_GET['token'] ?? null;

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

/* -------------------------------------------------
   1️⃣ Initialisation de la file si absente
------------------------------------------------- */
if (!isset($p['queue']) || !is_array($p['queue'])) {
  $p['queue'] = [];
}

/* -------------------------------------------------
   2️⃣ Nettoyage des joueurs trop anciens (sécurité)
------------------------------------------------- */
$MAX_WAIT = 600; // 10 minutes
$p['queue'] = array_values(array_filter($p['queue'], function ($q) use ($now, $MAX_WAIT) {
  return ($now - $q['joined_at']) < $MAX_WAIT;
}));

/* -------------------------------------------------
   3️⃣ Ajouter le joueur à la file s’il n’y est pas
------------------------------------------------- */
$index = null;
foreach ($p['queue'] as $i => $q) {
  if ($q['token'] === $token) {
    $index = $i;
    break;
  }
}

if ($index === null) {
  $p['queue'][] = [
    "token" => $token,
    "joined_at" => $now
  ];
  $index = count($p['queue']) - 1;
}

/* -------------------------------------------------
   4️⃣ Calcul du temps d’attente
------------------------------------------------- */
$timePerPlayer = (int)($p['time_per_player'] ?? 120);
$buffer = (int)($p['buffer_before_next'] ?? 15);

$wait = 0;

// Si quelqu’un est avant moi
if ($index > 0) {
  $first = $p['queue'][0];
  $elapsedFirst = $now - $first['joined_at'];
  $remainingFirst = max(0, $timePerPlayer - $elapsedFirst);

  $wait += $remainingFirst;
  $wait += ($index - 1) * $timePerPlayer;
}

// Tampon obligatoire avant passage
if ($index > 0) {
  $wait += $buffer;
}

/* -------------------------------------------------
   5️⃣ Sauvegarde
------------------------------------------------- */
$data[$id] = $p;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

/* -------------------------------------------------
   6️⃣ Réponse JSON
------------------------------------------------- */
echo json_encode([
  "id" => $id,
  "nom" => $p['nom'],
  "photo" => $p['photo'] ?? "",
  "position" => $index,
  "queue_length" => count($p['queue']),
  "wait_remaining" => max(0, $wait),
  "time_per_player" => $timePerPlayer,
  "buffer_before_next" => $buffer
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);


// Tampon obligatoire avant passage
if ($index > 0) {
  $wait += $buffer;
}

/* -------------------------------------------------
   5️⃣ Sauvegarde
------------------------------------------------- */
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

/* -------------------------------------------------
   6️⃣ Réponse JSON
------------------------------------------------- */
echo json_encode([
  "id" => $id,
  "nom" => $p['nom'],
  "photo" => $p['photo'] ?? "",
  "position" => $index,
  "queue_length" => count($p['queue']),
  "wait_remaining" => max(0, $wait),
  "time_per_player" => $timePerPlayer,
  "buffer_before_next" => $buffer
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
