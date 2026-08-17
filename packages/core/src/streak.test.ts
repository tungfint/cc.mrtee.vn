import { describe, expect, it } from 'vitest';
import { longestDateStreak } from './streak';

describe('date streak', () => {
  it('deduplicates days and finds the longest consecutive run', () => {
    expect(longestDateStreak(['2026-08-02', '2026-08-01', '2026-08-02', '2026-08-04'])).toBe(2);
  });
});
