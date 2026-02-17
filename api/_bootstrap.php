<?php

declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

set_exception_handler(function (Throwable $exception): void {
  if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(500);
  }

  error_log('[CLUEDO] ' . $exception->getMessage());

  echo json_encode([
    'ok' => false,
    'error' => 'critical runtime state error',
    'detail' => $exception->getMessage(),
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
});
