<?php

function cluedo_team_presence_path(): string
{
  return __DIR__ . '/../data/team_presence.json';
}

function cluedo_load_team_presence(): array
{
  $path = cluedo_team_presence_path();
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

function cluedo_save_team_presence(array $store): bool
{
  if (!isset($store['teams']) || !is_array($store['teams'])) {
    $store['teams'] = [];
  }

  return file_put_contents(
    cluedo_team_presence_path(),
    json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
  ) !== false;
}

function cluedo_touch_team_presence(string $token, int $timestamp): array
{
  if ($token === '') {
    return [];
  }

  $store = cluedo_load_team_presence();
  $isNew = !isset($store['teams'][$token]) || !is_array($store['teams'][$token]);
  if ($isNew) {
    $store['teams'][$token] = [];
  }

  if (!isset($store['teams'][$token]['first_seen_at'])) {
    $store['teams'][$token]['first_seen_at'] = $timestamp;
  }

  $store['teams'][$token]['last_seen_at'] = $timestamp;
  cluedo_save_team_presence($store);

  $entry = $store['teams'][$token];
  $entry['is_new'] = $isNew;
  return $entry;
}
