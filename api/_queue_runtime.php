<?php

function cluedo_is_initialized_queue_entry(array $entry): bool
{
  return trim((string) ($entry['team'] ?? '')) !== '';
}

function cluedo_clean_character_queue(array $queue, int $now, int $maxWaitSeconds = 600): array
{
  $cleaned = array_values(array_filter($queue, function ($entry) use ($now, $maxWaitSeconds) {
    return isset($entry['joined_at']) && ($now - (int) $entry['joined_at']) < $maxWaitSeconds;
  }));

  return array_values(array_filter($cleaned, 'cluedo_is_initialized_queue_entry'));
}

function cluedo_apply_runtime_handover(array $queue, int $now, int $timePerPlayerSeconds): array
{
  if (count($queue) <= 1) {
    return $queue;
  }

  $activeStartedAt = (int) ($queue[0]['joined_at'] ?? $now);
  $activeElapsed = max(0, $now - $activeStartedAt);
  $activeRemaining = max(0, $timePerPlayerSeconds - $activeElapsed);

  if ($activeRemaining > 0) {
    return $queue;
  }

  array_shift($queue);

  if (isset($queue[0])) {
    $queue[0]['joined_at'] = $now;
  }

  return array_values($queue);
}
