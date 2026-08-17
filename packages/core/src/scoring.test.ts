import { describe, expect, it } from 'vitest';
import { calculateCcLevel, calculateReward, type RatedSolve } from './scoring';

const policy = { decay: 0.95, denominator: 20, base: 800 };

describe('CC level', () => {
  it('is invariant to permutation, duplicate problems, and unrated solves', () => {
    const solves: RatedSolve[] = [
      { problemKey: 'a', rating: 1200 },
      { problemKey: 'b', rating: 1000 },
    ];
    const expected = calculateCcLevel(solves, policy);
    expect(calculateCcLevel([...solves].reverse(), policy)).toEqual(expected);
    expect(
      calculateCcLevel([...solves, solves[0]!, { problemKey: 'c', rating: null }], policy),
    ).toEqual(expected);
  });

  it.each([10, 20, 40, 60, 90])('matches the closed form for %i equal ratings', (count) => {
    const rating = 1500;
    const solves = Array.from({ length: count }, (_, index) => ({
      problemKey: String(index),
      rating,
    }));
    const expected = Math.max(800, (rating * (1 - 0.95 ** count)) / (20 * (1 - 0.95)));
    expect(calculateCcLevel(solves, policy).level).toBeCloseTo(expected, 2);
  });

  it('does not decrease when another normally qualifying solve is added', () => {
    const solves = [{ problemKey: 'a', rating: 1200 }];
    const before = calculateCcLevel(solves, policy).level;
    const after = calculateCcLevel([...solves, { problemKey: 'b', rating: 1000 }], policy).level;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('matches the documented simulations', () => {
    const beginner = [800, 900, 1000, 1100, 1200, 1300].flatMap((rating) =>
      Array.from({ length: 15 }, (_, index) => ({
        problemKey: `b-${rating}-${index}`,
        rating,
      })),
    );
    expect(calculateCcLevel(beginner, policy).level).toBe(1207.61);

    const strong = [1500, 1600, 1700, 1800, 1900].flatMap((rating) =>
      Array.from({ length: 16 }, (_, index) => ({
        problemKey: `s-${rating}-${index}`,
        rating,
      })),
    );
    expect(calculateCcLevel(strong, { ...policy, base: 1500 }).level).toBe(1799.56);
  });
});

describe('CC reward', () => {
  const rewardPolicy = { min: 0.05, max: 30, midpointDelta: 50, scale: 80 };

  it('is monotonic and clamped for the regression deltas', () => {
    const deltas = [-500, -300, -200, -100, 0, 100, 200, 300, 500];
    const rewards = deltas.map((delta) => calculateReward(1200 + delta, 1200, rewardPolicy));
    expect(rewards).toEqual([...rewards].sort((a, b) => a - b));
    expect(Math.min(...rewards)).toBeGreaterThanOrEqual(0.05);
    expect(Math.max(...rewards)).toBeLessThanOrEqual(30);
  });
});
