<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_auth.php';

$provided = cluedo_get_admin_pin_from_request();
$expected = cluedo_get_admin_pin();

if ($provided !== '' && hash_equals($expected, $provided)) {
  echo json_encode(['ok' => true]);
  exit;
}

http_response_code(403);
echo json_encode(['ok' => false, 'error' => 'forbidden']);
