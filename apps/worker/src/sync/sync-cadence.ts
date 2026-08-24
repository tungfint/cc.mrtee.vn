export type SyncTier = 'ONLINE' | 'RECENT' | 'OFFLINE';

export function syncTier(lastSeenAt: Date | string | null, now = new Date()): SyncTier {
  if (!lastSeenAt) return 'OFFLINE';
  const age = now.getTime() - new Date(lastSeenAt).getTime();
  if (age < 60 * 60_000) return 'ONLINE';
  if (age <= 120 * 60_000) return 'RECENT';
  return 'OFFLINE';
}

export function cadenceMinutes(
  tier: SyncTier,
  targets: { online: number; recent: number; offline: number },
): number {
  return tier === 'ONLINE' ? targets.online : tier === 'RECENT' ? targets.recent : targets.offline;
}
