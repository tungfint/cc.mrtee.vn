import { describe, expect, it } from 'vitest';
import {
  calculateDailyStreakBonus,
  calculateStreakBonus,
  currentDateStreak,
  longestDateStreak,
} from './streak';

describe('date streak', () => {
  it('deduplicates days and finds the longest consecutive run', () => {
    expect(longestDateStreak(['2026-08-02', '2026-08-01', '2026-08-02', '2026-08-04'])).toBe(2);
  });

  it('keeps a current streak alive through the local previous day only', () => {
    expect(currentDateStreak(['2026-08-16', '2026-08-17'], '2026-08-18')).toBe(2);
    expect(currentDateStreak(['2026-08-15', '2026-08-16'], '2026-08-18')).toBe(0);
  });
});

describe('streak bonus', () => {
  it('increases smoothly and caps the daily reward at four points', () => {
    expect(calculateDailyStreakBonus(0)).toBe(0);
    expect(calculateDailyStreakBonus(1)).toBe(1);
    expect(calculateDailyStreakBonus(2)).toBe(1.15);
    expect(calculateDailyStreakBonus(6)).toBe(1.75);
    expect(calculateDailyStreakBonus(7)).toBe(2);
    expect(calculateDailyStreakBonus(8)).toBe(2.15);
    expect(calculateDailyStreakBonus(20)).toBe(3.95);
    expect(calculateDailyStreakBonus(21)).toBe(4);
    expect(calculateDailyStreakBonus(365)).toBe(4);
  });

  it('reports the accumulated value of a streak', () => {
    expect(calculateStreakBonus(0)).toBe(0);
    expect(calculateStreakBonus(1)).toBe(1);
    expect(calculateStreakBonus(7)).toBe(10.25);
    expect(calculateStreakBonus(14)).toBe(28.45);
    expect(calculateStreakBonus(30)).toBe(89.9);
    expect(calculateStreakBonus(60)).toBe(209.9);
  });
});
