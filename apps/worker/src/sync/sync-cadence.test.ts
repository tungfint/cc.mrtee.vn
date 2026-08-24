import { describe, expect, it } from 'vitest';
import { cadenceMinutes, syncTier } from './sync-cadence';

describe('adaptive sync cadence', () => {
  const now = new Date('2026-08-18T00:00:00Z');

  it('classifies presence using the 60 and 120 minute boundaries', () => {
    expect(syncTier('2026-08-17T23:01:00Z', now)).toBe('ONLINE');
    expect(syncTier('2026-08-17T23:00:00Z', now)).toBe('RECENT');
    expect(syncTier('2026-08-17T22:00:00Z', now)).toBe('RECENT');
    expect(syncTier('2026-08-17T21:59:00Z', now)).toBe('OFFLINE');
    expect(syncTier(null, now)).toBe('OFFLINE');
  });

  it('uses fixed presence-aware scheduling targets', () => {
    const targets = { online: 15, recent: 30, offline: 1440 };
    expect(cadenceMinutes('ONLINE', targets)).toBe(15);
    expect(cadenceMinutes('RECENT', targets)).toBe(30);
    expect(cadenceMinutes('OFFLINE', targets)).toBe(1440);
  });
});
