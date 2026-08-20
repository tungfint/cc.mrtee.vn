import { describe, expect, it } from 'vitest';
import {
  calculateCcLevel,
  calculateCcLevelGain,
  calculateReward,
  type RatedSolve,
} from './scoring';

const levelPolicy = {
  initialLevel: 800,
  gainMax: 4,
  gainScale: 100,
  maxPositiveDelta: 500,
};

describe('CC Level v3.0', () => {
  it('uses chronological first-solve order and ignores duplicates/unrated solves', () => {
    const solves: RatedSolve[] = [
      { problemKey: 'later', rating: 1200, solvedAt: '2026-01-02', submissionId: 2 },
      { problemKey: 'first', rating: 800, solvedAt: '2026-01-01', submissionId: 1 },
      { problemKey: 'later', rating: 1500, solvedAt: '2026-01-03', submissionId: 3 },
      { problemKey: 'unrated', rating: null, solvedAt: '2026-01-04', submissionId: 4 },
    ];
    const expected = calculateCcLevel([solves[1]!, solves[0]!], levelPolicy);
    expect(calculateCcLevel(solves, levelPolicy)).toEqual(expected);
  });

  it.each([
    [-500, 0.0268],
    [-300, 0.1897],
    [-200, 0.4768],
    [-100, 1.0758],
    [0, 2],
    [100, 2.9242],
    [200, 3.5232],
    [300, 3.8103],
    [500, 3.9732],
  ])('adds the approved gain at delta %i', (delta, gain) => {
    expect(calculateCcLevelGain(1000 + delta, 1000, levelPolicy)).toBeCloseTo(gain, 4);
  });

  it('caps the positive difficulty delta at +500', () => {
    expect(calculateCcLevelGain(1500, 1000, levelPolicy)).toBe(
      calculateCcLevelGain(3000, 1000, levelPolicy),
    );
  });

  it('gives every rated first solve a positive gain that diminishes for fixed easy work', () => {
    let level = 1000;
    const gains: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const gain = calculateCcLevelGain(800, level, levelPolicy);
      gains.push(gain);
      level += gain;
    }
    expect(gains[0]).toBeCloseTo(0.4768, 4);
    expect(gains[99]!).toBeGreaterThan(0);
    expect(gains[99]!).toBeLessThan(gains[0]!);
  });

  it('needs about 50 maintained equal-level solves for +100 CCL', () => {
    expect(100 / calculateCcLevelGain(1000, 1000, levelPolicy)).toBe(50);
  });
});

describe('CC Point v3.0', () => {
  const rewardPolicy = {
    min: 0.25,
    max: 12.5,
    midpointDelta: 50,
    scale: 120,
    maxPositiveDelta: 500,
  };

  it.each([
    [-500, 0.37],
    [-300, 0.88],
    [-200, 1.61],
    [-100, 2.98],
    [0, 5.12],
    [100, 7.63],
    [200, 9.77],
    [300, 11.14],
    [500, 12.22],
  ])('awards the approved CCP at delta %i', (delta, expected) => {
    expect(calculateReward(1000 + delta, 1000, rewardPolicy)).toBe(expected);
  });

  it('caps rewards above +500 and preserves monotonicity', () => {
    const deltas = [-1000, -500, -300, -100, 0, 100, 300, 500, 1000];
    const rewards = deltas.map((delta) => calculateReward(1000 + delta, 1000, rewardPolicy));
    expect(rewards).toEqual([...rewards].sort((a, b) => a - b));
    expect(rewards.at(-1)).toBe(rewards.at(-2));
  });

  it('matches the 3,000 CCP calibration targets', () => {
    const normalAverage =
      calculateReward(1000, 1000, rewardPolicy) * 0.5 +
      calculateReward(1100, 1000, rewardPolicy) * 0.3 +
      calculateReward(1200, 1000, rewardPolicy) * 0.2;
    const strongAverage =
      calculateReward(1100, 1000, rewardPolicy) * 0.2 +
      calculateReward(1200, 1000, rewardPolicy) * 0.3 +
      calculateReward(1300, 1000, rewardPolicy) * 0.3 +
      calculateReward(1500, 1000, rewardPolicy) * 0.2;
    expect(3000 / normalAverage).toBeCloseTo(441, 0);
    expect(3000 / strongAverage).toBeCloseTo(293, 0);
  });
});
