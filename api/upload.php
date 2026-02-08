<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_data_store.php';

cluedo_require_admin_pin();

if (!isset($_POST['id']) || !isset($_FILES['file'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing params']);
  exit;
}

$id = preg_replace('/[^0-9]/', '', (string) $_POST['id']);
$file = $_FILES['file'];

if ($id === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid id']);
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

if (!is_writable($dir)) {
  imagedestroy($sourceImage);
  imagedestroy($finalImage);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'uploads directory not writable']);
  exit;
}

$name = 'perso_' . $id . '_' . bin2hex(random_bytes(8)) . '.jpg';
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

$dataPath = cluedo_data_path();
$rawData = (string) file_get_contents($dataPath);
$data = json_decode($rawData, true);

if (!is_array($data)) {
  @unlink($dest);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'invalid data store']);
  exit;
}

if (!isset($data[$id]) || !is_array($data[$id])) {
  $data[$id] = [];
}

$oldPhotoPath = isset($data[$id]['photo']) && is_string($data[$id]['photo'])
  ? trim($data[$id]['photo'])
  : null;

$relativePath = 'uploads/' . $name;
$data[$id]['photo'] = $relativePath;

$encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($encoded === false || file_put_contents($dataPath, $encoded) === false) {
  @unlink($dest);
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'save failed']);
  exit;
}

if ($oldPhotoPath !== null && $oldPhotoPath !== '' && $oldPhotoPath !== $relativePath) {
  $isReferencedByAnotherCharacter = false;
  foreach ($data as $characterId => $characterData) {
    if ((string) $characterId === $id || !is_array($characterData)) {
      continue;
    }

    if (($characterData['photo'] ?? null) === $oldPhotoPath) {
      $isReferencedByAnotherCharacter = true;
      break;
    }
  }

  if (!$isReferencedByAnotherCharacter && strpos($oldPhotoPath, 'uploads/') === 0) {
    $oldAbsolutePath = realpath($dir . '/' . basename($oldPhotoPath));
    $uploadsRealPath = realpath($dir);

    if ($oldAbsolutePath !== false && $uploadsRealPath !== false && strpos($oldAbsolutePath, $uploadsRealPath . DIRECTORY_SEPARATOR) === 0) {
      if (is_file($oldAbsolutePath) && !@unlink($oldAbsolutePath)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'old photo delete failed']);
        exit;
      }
    }
  }
}

echo json_encode([
  'ok' => true,
  'path' => $relativePath,
]);

]);