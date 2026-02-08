<?php

function cluedo_data_path(): string
{
  $runtimePath = __DIR__ . '/../data/personnages.json';
  $samplePath = __DIR__ . '/../data/personnages.sample.json';

  if (!file_exists($runtimePath)) {
    if (file_exists($samplePath)) {
      copy($samplePath, $runtimePath);
    } else {
      file_put_contents($runtimePath, '{}');
    }
  }

  return $runtimePath;
}
