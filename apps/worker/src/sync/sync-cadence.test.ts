import { describe, expect, it } from 'vitest';
import { cadenceMinutes, syncTier } from './sync-cadence';

describe('adaptive sync cadence', () => {
  const now = new Date('2026-08-18T00:00:00Z');

  it('classifies presence using the 10 and 30 minute boundaries', () => {
    expect(syncTier('2026-08-17T23:51:00Z', now)).toBe('ONLINE');
    expect(syncTier('2026-08-17T23:40:00Z', now)).toBe('RECENT');
    expect(syncTier('2026-08-17T23:29:00Z', now)).toBe('OFFLINE');
    expect(syncTier(null, now)).toBe('OFFLINE');
  });

  it('uses fixed presence-aware scheduling targets', () => {
    const targets = { online: 15, recent: 30, offline: 1440 };
    expect(cadenceMinutes('ONLINE', targets)).toBe(15);
    expect(cadenceMinutes('RECENT', targets)).toBe(30);
    expect(cadenceMinutes('OFFLINE', targets)).toBe(1440);
  });
});
