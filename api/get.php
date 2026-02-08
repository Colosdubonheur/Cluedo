<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/_data_store.php';
echo file_get_contents(cluedo_data_path());
