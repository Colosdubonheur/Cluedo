<?php

function cluedo_team_profiles_path(): string
{
  return __DIR__ . '/../data/team_profiles.json';
}

function cluedo_load_team_profiles(): array
{
  $path = cluedo_team_profiles_path();
  if (!file_exists($path)) {
    return ['teams' => []];
  }

  $decoded = json_decode((string) file_get_contents($path), true);
  if (!is_array($decoded)) {
    return ['teams' => []];
  }

  if (!isset($decoded['teams']) || !is_array($decoded['teams'])) {
    $decoded['teams'] = [];
  }

  return $decoded;
}

function cluedo_save_team_profiles(array $store): bool
{
  if (!isset($store['teams']) || !is_array($store['teams'])) {
    $store['teams'] = [];
  }

  return file_put_contents(
    cluedo_team_profiles_path(),
    json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
  ) !== false;
}

function cluedo_get_team_profile(array $store, string $token): array
{
  if (!isset($store['teams'][$token]) || !is_array($store['teams'][$token])) {
    return [
      'team_name' => '',
      'players' => array_fill(0, 10, ''),
      'photo' => '',
    ];
  }

  $profile = $store['teams'][$token];
  $players = isset($profile['players']) && is_array($profile['players']) ? $profile['players'] : [];
  $players = array_slice(array_pad(array_map(function ($player) {
    return trim((string) $player);
  }, $players), 10, ''), 0, 10);

  return [
    'team_name' => trim((string) ($profile['team_name'] ?? '')),
    'players' => $players,
    'photo' => trim((string) ($profile['photo'] ?? '')),
  ];
}
