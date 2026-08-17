import { describe, expect, it } from 'vitest';
import { currentDateStreak, longestDateStreak } from './streak';

describe('date streak', () => {
  it('deduplicates days and finds the longest consecutive run', () => {
    expect(longestDateStreak(['2026-08-02', '2026-08-01', '2026-08-02', '2026-08-04'])).toBe(2);
  });

  it('keeps a current streak alive through the local previous day only', () => {
    expect(currentDateStreak(['2026-08-16', '2026-08-17'], '2026-08-18')).toBe(2);
    expect(currentDateStreak(['2026-08-15', '2026-08-16'], '2026-08-18')).toBe(0);
  });
});
