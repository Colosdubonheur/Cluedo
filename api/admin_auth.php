<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_config_store.php';

$provided = cluedo_get_admin_pin_from_request();
$pinEnabled = cluedo_is_admin_pin_enabled();

if (!$pinEnabled && $provided !== '') {
  $saved = cluedo_save_config(['admin_code' => $provided]);
  if (!$saved) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config_save_failed', 'pin_enabled' => false]);
    exit;
  }

  echo json_encode(['ok' => true, 'pin_enabled' => true, 'created' => true]);
  exit;
}

if (!$pinEnabled) {
  echo json_encode(['ok' => true, 'pin_enabled' => false]);
  exit;
}

$expected = cluedo_get_admin_pin();

if ($provided !== '' && hash_equals($expected, $provided)) {
  echo json_encode(['ok' => true, 'pin_enabled' => true]);
  exit;
}

http_response_code(403);
echo json_encode(['ok' => false, 'error' => 'forbidden', 'pin_enabled' => true]);
