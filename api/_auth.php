<?php
require_once __DIR__ . '/_config_store.php';

function cluedo_get_admin_pin_from_request(): string
{
  if (isset($_SERVER['HTTP_X_ADMIN_PIN'])) {
    return trim((string) $_SERVER['HTTP_X_ADMIN_PIN']);
  }

  if (isset($_GET['admin_pin'])) {
    return trim((string) $_GET['admin_pin']);
  }

  return '';
}

function cluedo_require_admin_pin(): void
{
  if (!cluedo_is_admin_pin_enabled()) {
    return;
  }

  $expected = cluedo_get_admin_pin();
  $provided = cluedo_get_admin_pin_from_request();

  if ($provided === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'forbidden']);
    exit;
  }
}
