<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_auth.php';

if (!cluedo_is_admin_pin_enabled()) {
  echo json_encode(['ok' => true, 'pin_enabled' => false]);
  exit;
}

$provided = cluedo_get_admin_pin_from_request();
$expected = cluedo_get_admin_pin();

if ($provided !== '' && hash_equals($expected, $provided)) {
  echo json_encode(['ok' => true, 'pin_enabled' => true]);
  exit;
}

http_response_code(403);
echo json_encode(['ok' => false, 'error' => 'forbidden', 'pin_enabled' => true]);
