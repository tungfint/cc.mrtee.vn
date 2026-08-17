export type SyncTier = 'HOT' | 'WARM' | 'COLD';

export function syncTier(latestActivityAt: Date | string | null, now = new Date()): SyncTier {
  if (!latestActivityAt) return 'COLD';
  const age = now.getTime() - new Date(latestActivityAt).getTime();
  if (age <= 7 * 86_400_000) return 'HOT';
  if (age <= 30 * 86_400_000) return 'WARM';
  return 'COLD';
}

export function cadenceHours(
  tier: SyncTier,
  targets: { hot: number; warm: number; cold: number },
  pressure = 0,
): number {
  const base = tier === 'HOT' ? targets.hot : tier === 'WARM' ? targets.warm : targets.cold;
  return tier === 'HOT' ? base : base * (1 + Math.max(0, Math.min(2, pressure)));
}
