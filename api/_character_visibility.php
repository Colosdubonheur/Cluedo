<?php

function cluedo_character_is_active(array $character): bool
{
  if (!array_key_exists('active', $character)) {
    return true;
  }

  return (bool) $character['active'];
}

function cluedo_enforce_character_visibility(array &$data): bool
{
  $changed = false;

  foreach ($data as $characterId => $character) {
    if (!is_array($character)) {
      continue;
    }

    if (!array_key_exists('active', $character)) {
      $character['active'] = true;
      $changed = true;
    }

    if (!cluedo_character_is_active($character)) {
      $currentQueue = isset($character['queue']) && is_array($character['queue']) ? $character['queue'] : [];
      if (count($currentQueue) > 0) {
        $character['queue'] = [];
        $changed = true;
      }

      if (array_key_exists('handover', $character) && $character['handover'] !== null) {
        $character['handover'] = null;
        $changed = true;
      }
    }

    $data[$characterId] = $character;
  }

  return $changed;
}

function cluedo_get_active_characters(array $data): array
{
  return array_filter($data, function ($character) {
    return is_array($character) && cluedo_character_is_active($character);
  });
}
