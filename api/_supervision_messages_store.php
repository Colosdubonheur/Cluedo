<?php

function cluedo_supervision_messages_path(): string
{
  return __DIR__ . '/../data/supervision_messages.json';
}

function cluedo_load_supervision_messages(): array
{
  $path = cluedo_supervision_messages_path();
  if (!file_exists($path)) {
    return [
      'global' => ['text' => '', 'created_at' => 0],
      'teams' => [],
      'characters' => [],
    ];
  }

  $decoded = json_decode((string) file_get_contents($path), true);
  if (!is_array($decoded)) {
    return [
      'global' => ['text' => '', 'created_at' => 0],
      'teams' => [],
      'characters' => [],
    ];
  }

  if (!isset($decoded['global']) || !is_array($decoded['global'])) {
    $decoded['global'] = ['text' => '', 'created_at' => 0];
  }

  if (!isset($decoded['teams']) || !is_array($decoded['teams'])) {
    $decoded['teams'] = [];
  }

  if (!isset($decoded['characters']) || !is_array($decoded['characters'])) {
    $decoded['characters'] = [];
  }

  return $decoded;
}

function cluedo_save_supervision_messages(array $messages): bool
{
  if (!isset($messages['global']) || !is_array($messages['global'])) {
    $messages['global'] = ['text' => '', 'created_at' => 0];
  }

  if (!isset($messages['teams']) || !is_array($messages['teams'])) {
    $messages['teams'] = [];
  }

  if (!isset($messages['characters']) || !is_array($messages['characters'])) {
    $messages['characters'] = [];
  }

  return file_put_contents(
    cluedo_supervision_messages_path(),
    json_encode($messages, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
  ) !== false;
}

function cluedo_resolve_team_message(array $messages, string $token): array
{
  $teamMessage = $messages['teams'][$token] ?? null;
  if (is_array($teamMessage) && trim((string) ($teamMessage['text'] ?? '')) !== '') {
    return [
      'scope' => 'team',
      'text' => trim((string) ($teamMessage['text'] ?? '')),
      'created_at' => (int) ($teamMessage['created_at'] ?? 0),
    ];
  }

  $globalMessage = $messages['global'] ?? null;
  if (is_array($globalMessage) && trim((string) ($globalMessage['text'] ?? '')) !== '') {
    return [
      'scope' => 'global',
      'text' => trim((string) ($globalMessage['text'] ?? '')),
      'created_at' => (int) ($globalMessage['created_at'] ?? 0),
    ];
  }

  return [
    'scope' => 'none',
    'text' => '',
    'created_at' => 0,
  ];
}


function cluedo_resolve_character_message(array $messages, string $characterId): array
{
  $characterMessage = $messages['characters'][$characterId] ?? null;
  if (is_array($characterMessage) && trim((string) ($characterMessage['text'] ?? '')) !== '') {
    return [
      'scope' => 'character',
      'text' => trim((string) ($characterMessage['text'] ?? '')),
      'created_at' => (int) ($characterMessage['created_at'] ?? 0),
    ];
  }

  return [
    'scope' => 'none',
    'text' => '',
    'created_at' => 0,
  ];
}
