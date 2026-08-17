import { describe, expect, it } from 'vitest';
import { cadenceHours, syncTier } from './sync-cadence';

describe('adaptive sync cadence', () => {
  const now = new Date('2026-08-18T00:00:00Z');

  it('classifies recent activity into HOT, WARM, and COLD tiers', () => {
    expect(syncTier('2026-08-17T00:00:00Z', now)).toBe('HOT');
    expect(syncTier('2026-08-01T00:00:00Z', now)).toBe('WARM');
    expect(syncTier('2026-06-01T00:00:00Z', now)).toBe('COLD');
    expect(syncTier(null, now)).toBe('COLD');
  });

  it('keeps HOT responsive while stretching WARM and COLD under pressure', () => {
    const targets = { hot: 2, warm: 6, cold: 24 };
    expect(cadenceHours('HOT', targets, 1)).toBe(2);
    expect(cadenceHours('WARM', targets, 1)).toBe(12);
    expect(cadenceHours('COLD', targets, 0.5)).toBe(36);
  });
});
