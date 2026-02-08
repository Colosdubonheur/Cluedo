<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
file_put_contents(cluedo_data_path(), file_get_contents('php://input'));
echo json_encode(['ok' => true]);
