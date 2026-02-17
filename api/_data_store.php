<?php

declare(strict_types=1);

function cluedo_data_path(): string
{
  $runtimePath = __DIR__ . '/../data/personnages.json';
  $samplePath = __DIR__ . '/../data/personnages.sample.json';

  if (!file_exists($runtimePath)) {
    $allowRuntimeInit = getenv('CLUEDO_ALLOW_RUNTIME_INIT') === '1';
    if ($allowRuntimeInit) {
      cluedo_initialize_runtime_data($runtimePath, $samplePath);
    }

    if (!file_exists($runtimePath)) {
      throw new RuntimeException('critical: missing runtime data file data/personnages.json');
    }
  }

  return $runtimePath;
}

function cluedo_character_default(int $id): array
{
  return [
    'nom' => sprintf('Personnage %d', $id),
    'photo' => '',
    'location' => '',
    'time_per_player' => 120,
    'buffer_before_next' => 15,
    'last_access_at' => 0,
    'queue' => [],
    'active' => true,
  ];
}

function cluedo_normalize_characters_data(array $data): array
{
  $normalized = [];

  for ($id = 1; $id <= 15; $id++) {
    $key = (string) $id;
    $entry = isset($data[$key]) && is_array($data[$key]) ? $data[$key] : [];
    $character = array_merge(cluedo_character_default($id), $entry);

    $character['nom'] = trim((string) ($character['nom'] ?? '')) !== ''
      ? trim((string) $character['nom'])
      : sprintf('Personnage %d', $id);
    $character['photo'] = trim((string) ($character['photo'] ?? ''));
    $character['location'] = trim((string) ($character['location'] ?? ''));
    $character['time_per_player'] = max(1, (int) ($character['time_per_player'] ?? 120));
    $character['buffer_before_next'] = max(0, (int) ($character['buffer_before_next'] ?? 15));
    $character['last_access_at'] = max(0, (int) ($character['last_access_at'] ?? 0));
    $character['queue'] = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
    $character['active'] = ($character['active'] ?? true) !== false;

    $normalized[$key] = $character;
  }

  return $normalized;
}

function cluedo_initialize_runtime_data(string $runtimePath, string $samplePath): void
{
  if (file_exists($samplePath)) {
    $sampleContent = (string) file_get_contents($samplePath);
    if ($sampleContent !== '') {
      cluedo_write_json_file_atomically($runtimePath, $sampleContent);
      return;
    }
  }

  throw new RuntimeException('critical: sample data file is missing or empty, initialization refused');
}

function cluedo_characters_lock_path(): string
{
  return __DIR__ . '/../data/personnages.lock';
}

function cluedo_with_characters_lock(int $lockType, callable $callback)
{
  $lockPath = cluedo_characters_lock_path();
  $lockHandle = fopen($lockPath, 'c');

  if ($lockHandle === false) {
    throw new RuntimeException('critical: unable to open data/personnages.lock');
  }

  if (!flock($lockHandle, $lockType)) {
    fclose($lockHandle);
    throw new RuntimeException('critical: unable to lock data/personnages.lock');
  }

  try {
    return $callback();
  } finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
  }
}

function cluedo_decode_characters_json_or_fail(string $raw): array
{
  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    throw new RuntimeException('critical: invalid JSON in data/personnages.json');
  }

  return cluedo_normalize_characters_data($decoded);
}

function cluedo_get_characters_data(): array
{
  return cluedo_with_characters_lock(LOCK_SH, function (): array {
    $path = cluedo_data_path();
    $raw = (string) @file_get_contents($path);

    if ($raw === '') {
      throw new RuntimeException('critical: empty content in data/personnages.json');
    }

    return cluedo_decode_characters_json_or_fail($raw);
  });
}

function cluedo_save_characters_data(array $data): void
{
  cluedo_with_characters_lock(LOCK_EX, function () use ($data): void {
    $path = cluedo_data_path();
    $normalized = cluedo_normalize_characters_data($data);
    $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    if ($encoded === false) {
      throw new RuntimeException('critical: failed to encode characters data');
    }

    cluedo_write_json_file_atomically($path, $encoded);
  });
}

function cluedo_update_characters_data(callable $mutator): array
{
  return cluedo_with_characters_lock(LOCK_EX, function () use ($mutator): array {
    $path = cluedo_data_path();
    $raw = (string) @file_get_contents($path);

    if ($raw === '') {
      throw new RuntimeException('critical: empty content in data/personnages.json');
    }

    $current = cluedo_decode_characters_json_or_fail($raw);
    $updated = $mutator($current);

    if (!is_array($updated)) {
      throw new RuntimeException('critical: characters mutator must return an array');
    }

    $normalized = cluedo_normalize_characters_data($updated);
    $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
      throw new RuntimeException('critical: failed to encode updated characters data');
    }

    cluedo_write_json_file_atomically($path, $encoded);

    return $normalized;
  });
}

function cluedo_write_json_file_atomically(string $path, string $content): void
{
  $dir = dirname($path);
  if (!is_dir($dir) || !is_writable($dir)) {
    throw new RuntimeException('critical: data directory is not writable');
  }

  $tmpPath = $path . '.tmp.' . bin2hex(random_bytes(6));
  $bytes = file_put_contents($tmpPath, $content . "\n", LOCK_EX);
  if ($bytes === false) {
    @unlink($tmpPath);
    throw new RuntimeException('critical: failed to write temporary characters data file');
  }

  if (!rename($tmpPath, $path)) {
    @unlink($tmpPath);
    throw new RuntimeException('critical: failed to atomically replace data/personnages.json');
  }
}
