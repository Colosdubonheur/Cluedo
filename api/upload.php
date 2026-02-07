<?php
header('Content-Type: application/json; charset=utf-8');

if (!isset($_POST['id']) || !isset($_FILES['file'])) {
  echo json_encode(["ok"=>false,"error"=>"missing params"]);
  exit;
}

$id = preg_replace('/[^0-9]/', '', $_POST['id']);
$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
  echo json_encode(["ok"=>false,"error"=>"upload error"]);
  exit;
}

$allowed = [
  'image/jpeg' => 'jpg',
  'image/png'  => 'png',
  'image/webp' => 'webp'
];

$mime = mime_content_type($file['tmp_name']);
if (!isset($allowed[$mime])) {
  echo json_encode(["ok"=>false,"error"=>"format non autorisé"]);
  exit;
}

$ext = $allowed[$mime];
$dir = __DIR__ . '/../uploads';

if (!is_dir($dir)) {
  mkdir($dir, 0755, true);
}

$name = "perso_{$id}_" . time() . "." . $ext;
$dest = $dir . "/" . $name;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
  echo json_encode(["ok"=>false,"error"=>"move failed"]);
  exit;
}

echo json_encode([
  "ok" => true,
  "path" => "uploads/" . $name
]);