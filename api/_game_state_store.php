<?php

function cluedo_game_state_path(): string
{
  return __DIR__ . '/../data/game_state.json';
}

function cluedo_default_game_state(): array
{
  return [
    'end_game_active' => false,
    'updated_at' => 0,
  ];
}

function cluedo_load_game_state(): array
{
  $path = cluedo_game_state_path();
  if (!file_exists($path)) {
    cluedo_save_game_state(cluedo_default_game_state());
  }

  $decoded = json_decode((string) @file_get_contents($path), true);
  if (!is_array($decoded)) {
    $decoded = cluedo_default_game_state();
    cluedo_save_game_state($decoded);
  }

  return [
    'end_game_active' => !empty($decoded['end_game_active']),
    'updated_at' => max(0, (int) ($decoded['updated_at'] ?? 0)),
  ];
}

function cluedo_save_game_state(array $state): void
{
  $path = cluedo_game_state_path();
  $payload = [
    'end_game_active' => !empty($state['end_game_active']),
    'updated_at' => max(0, (int) ($state['updated_at'] ?? time())),
  ];

  file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
