<?php

function cluedo_deleted_team_tokens_path(): string
{
  return __DIR__ . '/../data/deleted_team_tokens.json';
}

function cluedo_load_deleted_team_tokens(): array
{
  $path = cluedo_deleted_team_tokens_path();
  if (!file_exists($path)) {
    return ['tokens' => []];
  }

  $decoded = json_decode((string) file_get_contents($path), true);
  if (!is_array($decoded)) {
    return ['tokens' => []];
  }

  if (!isset($decoded['tokens']) || !is_array($decoded['tokens'])) {
    $decoded['tokens'] = [];
  }

  $decoded['tokens'] = array_values(array_unique(array_filter(array_map(function ($value) {
    return trim((string) $value);
  }, $decoded['tokens']), function ($value) {
    return $value !== '';
  })));

  return $decoded;
}

function cluedo_save_deleted_team_tokens(array $store): bool
{
  if (!isset($store['tokens']) || !is_array($store['tokens'])) {
    $store['tokens'] = [];
  }

  return (bool) file_put_contents(
    cluedo_deleted_team_tokens_path(),
    json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
    LOCK_EX
  );
}

function cluedo_mark_team_token_deleted(string $token): void
{
  $resolvedToken = trim($token);
  if ($resolvedToken === '') {
    return;
  }

  $store = cluedo_load_deleted_team_tokens();
  if (!in_array($resolvedToken, $store['tokens'], true)) {
    $store['tokens'][] = $resolvedToken;
    cluedo_save_deleted_team_tokens($store);
  }
}

function cluedo_is_team_token_deleted(string $token): bool
{
  $resolvedToken = trim($token);
  if ($resolvedToken === '') {
    return false;
  }

  $store = cluedo_load_deleted_team_tokens();
  return in_array($resolvedToken, $store['tokens'], true);
}
