<?php
header('Content-Type: application/json; charset=utf-8');

$timezone = date_default_timezone_get();
$version = date('y.m.d.H.i');

echo json_encode([
  'ok' => true,
  'version' => $version,
  'timezone' => $timezone,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
