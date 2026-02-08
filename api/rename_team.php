<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_character_visibility.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
  $input = $_POST;
}

$id = $input['id'] ?? null;
$teamId = $input['team_id'] ?? ($input['token'] ?? null);
$newName = trim((string) ($input['nouveau_nom'] ?? ($input['team_name'] ?? '')));

if (!$id || !$teamId || $newName === '') {
  echo json_encode(["ok" => false, "error" => "missing id, team_id or nouveau_nom"]);
  exit;
}

$path = cluedo_data_path();
$data = json_decode(file_get_contents($path), true);

if (!isset($data[$id])) {
  echo json_encode(["ok" => false, "error" => "unknown id"]);
  exit;
}

$changed = cluedo_enforce_character_visibility($data);

if (!cluedo_character_is_active($data[$id])) {
  if ($changed) {
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  }

  http_response_code(403);
  echo json_encode(["ok" => false, "error" => "character unavailable"]);
  exit;
}

$p = $data[$id];
if (!isset($p['queue']) || !is_array($p['queue'])) {
  $p['queue'] = [];
}

$index = null;
foreach ($p['queue'] as $i => $entry) {
  if (($entry['token'] ?? null) === $teamId) {
    $index = $i;
    break;
  }
}

if ($index === null) {
  echo json_encode(["ok" => false, "error" => "team not found in queue"]);
  exit;
}

$p['queue'][$index]['team'] = $newName;
$data[$id] = $p;
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode([
  "ok" => true,
  "equipe" => [
    "id" => (string) $teamId,
    "nom" => $newName,
  ],
  "file" => [
    "position" => $index,
    "total" => count($p['queue']),
  ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
