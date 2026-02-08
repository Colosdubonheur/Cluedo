<?php

function cluedo_data_path(): string
{
  $runtimePath = __DIR__ . '/../data/personnages.json';
  $samplePath = __DIR__ . '/../data/personnages.sample.json';

  if (!file_exists($runtimePath)) {
    cluedo_initialize_runtime_data($runtimePath, $samplePath);
  }

  $decoded = json_decode((string) @file_get_contents($runtimePath), true);
  if (!is_array($decoded)) {
    cluedo_initialize_runtime_data($runtimePath, $samplePath);
  }

  return $runtimePath;
}

function cluedo_initialize_runtime_data(string $runtimePath, string $samplePath): void
{
  if (file_exists($samplePath)) {
    $sampleContent = (string) file_get_contents($samplePath);
    if ($sampleContent !== '') {
      file_put_contents($runtimePath, $sampleContent);
      return;
    }
  }

  file_put_contents($runtimePath, '{}');
}
