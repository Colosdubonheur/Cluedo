<?php

function cluedo_supervision_messages_path(): string
{
  return __DIR__ . '/../data/supervision_messages.json';
}

function cluedo_load_supervision_messages(): array
{
  $path = cluedo_supervision_messages_path();
  $defaults = [
    'team_broadcast' => ['text' => '', 'created_at' => 0],
    'character_broadcast' => ['text' => '', 'created_at' => 0],
    'teams' => [],
    'characters' => [],
    'cleared_at' => 0,
  ];

  if (!file_exists($path)) {
    return $defaults;
  }

  $decoded = json_decode((string) file_get_contents($path), true);
  if (!is_array($decoded)) {
    return $defaults;
  }

  // Compatibilité des anciennes données : "global" visait le canal équipe.
  if (!isset($decoded['team_broadcast']) || !is_array($decoded['team_broadcast'])) {
    $legacyGlobal = $decoded['global'] ?? null;
    if (is_array($legacyGlobal)) {
      $decoded['team_broadcast'] = [
        'text' => trim((string) ($legacyGlobal['text'] ?? '')),
        'created_at' => (int) ($legacyGlobal['created_at'] ?? 0),
      ];
    } else {
      $decoded['team_broadcast'] = $defaults['team_broadcast'];
    }
  }

  if (!isset($decoded['character_broadcast']) || !is_array($decoded['character_broadcast'])) {
    $decoded['character_broadcast'] = $defaults['character_broadcast'];
  }

  $decoded['teams'] = isset($decoded['teams']) && is_array($decoded['teams']) ? $decoded['teams'] : [];
  $decoded['characters'] = isset($decoded['characters']) && is_array($decoded['characters']) ? $decoded['characters'] : [];
  $decoded['cleared_at'] = (int) ($decoded['cleared_at'] ?? 0);

  return $decoded;
}

function cluedo_clear_supervision_messages_history(): bool
{
  return cluedo_save_supervision_messages([
    'team_broadcast' => ['text' => '', 'created_at' => 0],
    'character_broadcast' => ['text' => '', 'created_at' => 0],
    'teams' => [],
    'characters' => [],
    'cleared_at' => time(),
  ]);
}

function cluedo_save_supervision_messages(array $messages): bool
{
  $messages['team_broadcast'] = isset($messages['team_broadcast']) && is_array($messages['team_broadcast'])
    ? $messages['team_broadcast']
    : ['text' => '', 'created_at' => 0];

  $messages['character_broadcast'] = isset($messages['character_broadcast']) && is_array($messages['character_broadcast'])
    ? $messages['character_broadcast']
    : ['text' => '', 'created_at' => 0];

  $messages['teams'] = isset($messages['teams']) && is_array($messages['teams']) ? $messages['teams'] : [];
  $messages['characters'] = isset($messages['characters']) && is_array($messages['characters']) ? $messages['characters'] : [];
  $messages['cleared_at'] = (int) ($messages['cleared_at'] ?? 0);

  unset($messages['global']);

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
      'cleared_at' => (int) ($messages['cleared_at'] ?? 0),
    ];
  }

  $teamBroadcast = $messages['team_broadcast'] ?? null;
  if (is_array($teamBroadcast) && trim((string) ($teamBroadcast['text'] ?? '')) !== '') {
    return [
      'scope' => 'team_broadcast',
      'text' => trim((string) ($teamBroadcast['text'] ?? '')),
      'created_at' => (int) ($teamBroadcast['created_at'] ?? 0),
      'cleared_at' => (int) ($messages['cleared_at'] ?? 0),
    ];
  }

  return [
    'scope' => 'none',
    'text' => '',
    'created_at' => 0,
    'cleared_at' => (int) ($messages['cleared_at'] ?? 0),
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
      'cleared_at' => (int) ($messages['cleared_at'] ?? 0),
    ];
  }

  $characterBroadcast = $messages['character_broadcast'] ?? null;
  if (is_array($characterBroadcast) && trim((string) ($characterBroadcast['text'] ?? '')) !== '') {
    return [
      'scope' => 'character_broadcast',
      'text' => trim((string) ($characterBroadcast['text'] ?? '')),
      'created_at' => (int) ($characterBroadcast['created_at'] ?? 0),
      'cleared_at' => (int) ($messages['cleared_at'] ?? 0),
    ];
  }

  return [
    'scope' => 'none',
    'text' => '',
    'created_at' => 0,
    'cleared_at' => (int) ($messages['cleared_at'] ?? 0),
  ];
}
