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
    $decoded = json_decode((string) @file_get_contents($runtimePath), true);
  }

  $normalized = cluedo_normalize_characters_data(is_array($decoded) ? $decoded : []);
  $normalizedEncoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
  $currentEncoded = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
  if ($normalizedEncoded !== false && $normalizedEncoded !== $currentEncoded) {
    file_put_contents($runtimePath, $normalizedEncoded);
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
      file_put_contents($runtimePath, $sampleContent);
      return;
    }
  }

  file_put_contents($runtimePath, '{}');
}
