<?php
require_once __DIR__ . '/_bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
require_once __DIR__ . '/_auth.php';
cluedo_require_admin_pin();
echo file_get_contents(cluedo_data_path());
