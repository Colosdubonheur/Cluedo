<?php

function cluedo_config_path(): string
{
  $runtimePath = __DIR__ . '/../data/config.json';
  $samplePath = __DIR__ . '/../data/config.sample.json';

  if (!file_exists($runtimePath)) {
    cluedo_initialize_runtime_config($runtimePath, $samplePath);
  }

  $decoded = json_decode((string) @file_get_contents($runtimePath), true);
  if (!is_array($decoded)) {
    cluedo_initialize_runtime_config($runtimePath, $samplePath);
  }

  return $runtimePath;
}

function cluedo_initialize_runtime_config(string $runtimePath, string $samplePath): void
{
  if (file_exists($samplePath)) {
    $sampleContent = (string) file_get_contents($samplePath);
    if ($sampleContent !== '') {
      file_put_contents($runtimePath, $sampleContent);
      return;
    }
  }

  file_put_contents($runtimePath, "{}\n");
}

function cluedo_get_config(): array
{
  $path = cluedo_config_path();
  $decoded = json_decode((string) file_get_contents($path), true);
  return is_array($decoded) ? $decoded : [];
}

function cluedo_save_config(array $config): bool
{
  $path = cluedo_config_path();
  $encoded = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

  if ($encoded === false) {
    return false;
  }

  return file_put_contents($path, $encoded . "\n") !== false;
}

function cluedo_get_admin_pin(): string
{
  $config = cluedo_get_config();
  $rawPin = $config['admin_code'] ?? $config['admin_pin'] ?? '';
  return trim((string) $rawPin);
}

function cluedo_is_admin_pin_enabled(): bool
{
  return cluedo_get_admin_pin() !== '';
}
