import { describe, expect, it } from 'vitest';
import { calculateCcLevel, calculateReward, type RatedSolve } from './scoring';

const corePolicy = { decay: 0.95, denominator: 20, base: 800 };
const policy = {
  ...corePolicy,
  masteryFactor: 8,
  masteryScale: 4,
  masteryRatingStep: 400,
};

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
    expect(calculateCcLevel(solves, policy).coreLevel).toBeCloseTo(expected, 2);
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
    expect(calculateCcLevel(beginner, policy).coreLevel).toBe(1207.61);

    const strong = [1500, 1600, 1700, 1800, 1900].flatMap((rating) =>
      Array.from({ length: 16 }, (_, index) => ({
        problemKey: `s-${rating}-${index}`,
        rating,
      })),
    );
    expect(calculateCcLevel(strong, { ...policy, base: 1500 }).coreLevel).toBe(1799.56);
  });

  it('records every rated first solve with diminishing gains', () => {
    const levels = Array.from(
      { length: 100 },
      (_, index) =>
        calculateCcLevel(
          Array.from({ length: index + 1 }, (_, solveIndex) => ({
            problemKey: `p-${solveIndex}`,
            rating: 800,
          })),
          policy,
        ).level,
    );
    expect(levels[0]).toBe(801.79);
    expect(levels[1]! - levels[0]!).toBeGreaterThan(levels[99]! - levels[98]!);
    expect(levels[99]! - levels[98]!).toBeGreaterThan(0);
    const thousandEasySolves = calculateCcLevel(
      Array.from({ length: 1000 }, (_, index) => ({ problemKey: `farm-${index}`, rating: 800 })),
      policy,
    );
    expect(thousandEasySolves.level).toBeLessThan(850);
  });

  it('rewards harder evidence more without changing the reward reference core', () => {
    const first800 = calculateCcLevel([{ problemKey: '800', rating: 800 }], policy);
    const first900 = calculateCcLevel([{ problemKey: '900', rating: 900 }], policy);
    expect(first900.level - policy.base).toBeGreaterThan(first800.level - policy.base);
    expect(first800.coreLevel).toBe(800);
    expect(first900.coreLevel).toBe(800);
  });

  it('still adds a small positive amount for an easier solve above base', () => {
    const history = Array.from({ length: 60 }, (_, index) => ({
      problemKey: `hard-${index}`,
      rating: 1100,
    }));
    const before = calculateCcLevel(history, policy).level;
    const after = calculateCcLevel([...history, { problemKey: 'easy', rating: 800 }], policy).level;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(3);
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
