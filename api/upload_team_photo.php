<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_team_profiles_store.php';

if (!isset($_POST['token']) || !isset($_FILES['file'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing params']);
  exit;
}

$token = trim((string) $_POST['token']);
$file = $_FILES['file'];

if ($token === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid token']);
  exit;
}

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'upload error']);
  exit;
}

$tmpPath = (string) ($file['tmp_name'] ?? '');
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid upload']);
  exit;
}

$mime = mime_content_type($tmpPath);
$allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
if (!in_array($mime, $allowedMimes, true)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'format non autorisé']);
  exit;
}

$imgInfo = @getimagesize($tmpPath);
if (!is_array($imgInfo) || !isset($imgInfo[0], $imgInfo[1])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'image invalide']);
  exit;
}

$width = (int) $imgInfo[0];
$height = (int) $imgInfo[1];
if ($width <= 0 || $height <= 0 || $width !== $height) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'crop carré obligatoire']);
  exit;
}

if (!extension_loaded('gd')) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'gd extension required']);
  exit;
}

switch ($mime) {
  case 'image/jpeg':
    $sourceImage = @imagecreatefromjpeg($tmpPath);
    break;
  case 'image/png':
    $sourceImage = @imagecreatefrompng($tmpPath);
    break;
  case 'image/webp':
    $sourceImage = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmpPath) : false;
    break;
  default:
    $sourceImage = false;
}

if (!$sourceImage) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'image non lisible']);
  exit;
}

$finalSize = 600;
$finalImage = imagecreatetruecolor($finalSize, $finalSize);
if (!$finalImage) {
  imagedestroy($sourceImage);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'traitement image impossible']);
  exit;
}

if (!imagecopyresampled($finalImage, $sourceImage, 0, 0, 0, 0, $finalSize, $finalSize, $width, $height)) {
  imagedestroy($sourceImage);
  imagedestroy($finalImage);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'redimensionnement impossible']);
  exit;
}

$dir = __DIR__ . '/../uploads';
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
  imagedestroy($sourceImage);
  imagedestroy($finalImage);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'upload directory unavailable']);
  exit;
}

$name = 'team_' . preg_replace('/[^a-zA-Z0-9]/', '', $token) . '_' . bin2hex(random_bytes(8)) . '.jpg';
$relativePath = 'uploads/' . $name;
$dest = $dir . '/' . $name;

$written = imagejpeg($finalImage, $dest, 84);
imagedestroy($sourceImage);
imagedestroy($finalImage);

if (!$written || !is_file($dest) || filesize($dest) === 0) {
  @unlink($dest);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'write failed']);
  exit;
}

$profilesStore = cluedo_load_team_profiles();
$profile = cluedo_get_team_profile($profilesStore, $token);
$oldPhoto = $profile['photo'];
$profile['photo'] = $relativePath;
$profilesStore['teams'][$token] = $profile;

if (!cluedo_save_team_profiles($profilesStore)) {
  @unlink($dest);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'save failed']);
  exit;
}

if ($oldPhoto !== '' && $oldPhoto !== $relativePath && strpos($oldPhoto, 'uploads/') === 0) {
  $oldAbsolutePath = realpath($dir . '/' . basename($oldPhoto));
  $uploadsRealPath = realpath($dir);

  if ($oldAbsolutePath !== false && $uploadsRealPath !== false && strpos($oldAbsolutePath, $uploadsRealPath . DIRECTORY_SEPARATOR) === 0) {
    if (is_file($oldAbsolutePath)) {
      @unlink($oldAbsolutePath);
    }
  }
}

echo json_encode(['ok' => true, 'photo' => $relativePath], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
