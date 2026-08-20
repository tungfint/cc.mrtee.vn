export interface RatedSolve {
  problemKey: string;
  rating: number | null;
}

export interface LevelPolicy {
  decay: number;
  denominator: number;
  base: number;
  masteryFactor?: number;
  masteryScale?: number;
  masteryRatingStep?: number;
}

export function calculateCcLevel(
  solves: RatedSolve[],
  policy: LevelPolicy,
): {
  calculated: number;
  coreLevel: number;
  masteryBonus: number;
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
  const coreLevel = round2(Math.max(policy.base, calculated));
  const masteryFactor = policy.masteryFactor ?? 0;
  const masteryScale = policy.masteryScale ?? 4;
  const masteryRatingStep = policy.masteryRatingStep ?? 400;
  const evidence = ratings.reduce(
    (sum, rating) =>
      sum + Math.min(2, Math.max(0.25, 2 ** ((rating - policy.base) / masteryRatingStep))),
    0,
  );
  const masteryBonus = round2(masteryFactor * Math.log1p(evidence / masteryScale));
  return {
    calculated: roundedCalculated,
    coreLevel,
    masteryBonus,
    level: round2(coreLevel + masteryBonus),
  };
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
