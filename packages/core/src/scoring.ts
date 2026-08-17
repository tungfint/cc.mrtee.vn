export interface RatedSolve {
  problemKey: string;
  rating: number | null;
}

export interface LevelPolicy {
  decay: number;
  denominator: number;
  base: number;
}

export function calculateCcLevel(
  solves: RatedSolve[],
  policy: LevelPolicy,
): {
  calculated: number;
  level: number;
} {
  const uniqueRatings = new Map<string, number>();
  for (const solve of solves) {
    if (solve.rating === null) continue;
    const existing = uniqueRatings.get(solve.problemKey);
    if (existing === undefined || solve.rating > existing) {
      uniqueRatings.set(solve.problemKey, solve.rating);
    }
  }
  const ratings = [...uniqueRatings.values()].sort((a, b) => b - a);
  const calculated =
    ratings.reduce((sum, rating, index) => sum + rating * policy.decay ** index, 0) /
    policy.denominator;
  const roundedCalculated = round2(calculated);
  return { calculated: roundedCalculated, level: round2(Math.max(policy.base, calculated)) };
}

export interface RewardPolicy {
  min: number;
  max: number;
  midpointDelta: number;
  scale: number;
}

export function calculateReward(
  problemRating: number,
  levelBefore: number,
  policy: RewardPolicy,
): number {
  const raw =
    policy.min +
    (policy.max - policy.min) /
      (1 + Math.exp(-((problemRating - levelBefore - policy.midpointDelta) / policy.scale)));
  return Math.min(policy.max, Math.max(policy.min, round2(raw)));
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
