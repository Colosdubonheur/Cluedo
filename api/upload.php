<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_data_store.php';

cluedo_require_admin_pin();

if (!isset($_POST['id']) || !isset($_FILES['file'])) {
  echo json_encode(['ok' => false, 'error' => 'missing params']);
  exit;
}

$id = preg_replace('/[^0-9]/', '', (string) $_POST['id']);
$file = $_FILES['file'];

if ($id === '') {
  echo json_encode(['ok' => false, 'error' => 'invalid id']);
  exit;
}

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
  echo json_encode(['ok' => false, 'error' => 'upload error']);
  exit;
}

$allowed = [
  'image/jpeg' => 'jpg',
  'image/png' => 'png',
  'image/webp' => 'webp',
];

$mime = mime_content_type((string) $file['tmp_name']);
if (!isset($allowed[$mime])) {
  echo json_encode(['ok' => false, 'error' => 'format non autorisé']);
  exit;
}

$ext = $allowed[$mime];
$dir = __DIR__ . '/../uploads';

if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
  echo json_encode(['ok' => false, 'error' => 'upload directory unavailable']);
  exit;
}

$name = "perso_{$id}_" . time() . ".{$ext}";
$dest = $dir . '/' . $name;

if (!move_uploaded_file((string) $file['tmp_name'], $dest)) {
  echo json_encode(['ok' => false, 'error' => 'move failed']);
  exit;
}

$dataPath = cluedo_data_path();
$rawData = (string) file_get_contents($dataPath);
$data = json_decode($rawData, true);

if (!is_array($data)) {
  echo json_encode(['ok' => false, 'error' => 'invalid data store']);
  exit;
}

if (!isset($data[$id]) || !is_array($data[$id])) {
  $data[$id] = [];
}

$relativePath = 'uploads/' . $name;
$data[$id]['photo'] = $relativePath;

$encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($encoded === false || file_put_contents($dataPath, $encoded) === false) {
  echo json_encode(['ok' => false, 'error' => 'save failed']);
  exit;
}

echo json_encode([
  'ok' => true,
  'path' => $relativePath,
]);
}

echo json_encode([
  "ok" => true,
  "path" => "uploads/" . $name
]);