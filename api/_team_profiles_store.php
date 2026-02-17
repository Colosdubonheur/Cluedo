<?php

declare(strict_types=1);

function cluedo_team_profiles_path(): string
{
  return __DIR__ . '/../data/team_profiles.json';
}

function cluedo_load_team_profiles(): array
{
  return cluedo_with_team_profiles_lock(LOCK_SH, function (): array {
    $path = cluedo_team_profiles_path();
    if (!file_exists($path)) {
      return ['teams' => []];
    }

    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) {
      return ['teams' => []];
    }

    return cluedo_normalize_team_profiles_store($decoded);
  });
}

function cluedo_save_team_profiles(array $store): bool
{
  return cluedo_with_team_profiles_lock(LOCK_EX, function () use ($store): bool {
    $normalized = cluedo_normalize_team_profiles_store($store);
    $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
      return false;
    }

    return file_put_contents(cluedo_team_profiles_path(), $encoded) !== false;
  });
}

function cluedo_update_team_profiles(callable $mutator): array
{
  return cluedo_with_team_profiles_lock(LOCK_EX, function () use ($mutator): array {
    $path = cluedo_team_profiles_path();
    $current = ['teams' => []];

    if (file_exists($path)) {
      $decoded = json_decode((string) file_get_contents($path), true);
      if (is_array($decoded)) {
        $current = $decoded;
      }
    }

    $normalizedCurrent = cluedo_normalize_team_profiles_store($current);
    $updated = $mutator($normalizedCurrent);
    if (!is_array($updated)) {
      throw new RuntimeException('critical: team profiles mutator must return an array');
    }

    $normalized = cluedo_normalize_team_profiles_store($updated);
    $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
      throw new RuntimeException('critical: failed to encode team profiles data');
    }

    if (file_put_contents($path, $encoded) === false) {
      throw new RuntimeException('critical: failed to write team profiles data');
    }

    return $normalized;
  });
}

function cluedo_team_profiles_lock_path(): string
{
  return __DIR__ . '/../data/team_profiles.lock';
}

function cluedo_with_team_profiles_lock(int $lockType, callable $callback)
{
  $lockHandle = fopen(cluedo_team_profiles_lock_path(), 'c');
  if ($lockHandle === false) {
    throw new RuntimeException('critical: unable to open data/team_profiles.lock');
  }

  if (!flock($lockHandle, $lockType)) {
    fclose($lockHandle);
    throw new RuntimeException('critical: unable to lock data/team_profiles.lock');
  }

  try {
    return $callback();
  } finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
  }
}

function cluedo_normalize_team_profiles_store(array $store): array
{
  $teams = isset($store['teams']) && is_array($store['teams']) ? $store['teams'] : [];
  $normalizedTeams = [];

  foreach ($teams as $token => $profile) {
    if (!is_array($profile)) {
      $profile = [];
    }

    $normalizedTeams[(string) $token] = cluedo_normalize_team_profile($profile);
  }

  return ['teams' => $normalizedTeams];
}

function cluedo_normalize_team_profile(array $profile): array
{
  $players = isset($profile['players']) && is_array($profile['players']) ? $profile['players'] : [];
  $players = array_slice(array_pad(array_map(function ($player) {
    return trim((string) $player);
  }, $players), 10, ''), 0, 10);

  return [
    'team_name' => trim((string) ($profile['team_name'] ?? '')),
    'players' => $players,
    'photo' => trim((string) ($profile['photo'] ?? '')),
    'incomplete_team_penalty' => !empty($profile['incomplete_team_penalty']),
    'score' => (int) ($profile['score'] ?? 0),
  ];
}

function cluedo_get_team_profile(array $store, string $token): array
{
  if (!isset($store['teams'][$token]) || !is_array($store['teams'][$token])) {
    return cluedo_normalize_team_profile([]);
  }

  return cluedo_normalize_team_profile($store['teams'][$token]);
}
