export interface RatedSolve {
  problemKey: string;
  rating: number | null;
  solvedAt?: Date | string | number;
  submissionId?: string | number;
}

export interface LevelPolicy {
  initialLevel: number;
  gainMax: number;
  gainScale: number;
  maxPositiveDelta: number;
}

export interface CcLevelResult {
  calculated: number;
  coreLevel: number;
  masteryBonus: number;
  level: number;
}

/** Scoring policy v3.0: every unique rated first solve adds a positive gain. */
export function calculateCcLevelGain(
  problemRating: number,
  levelBefore: number,
  policy: LevelPolicy,
): number {
  const delta = Math.min(problemRating - levelBefore, policy.maxPositiveDelta);
  return round4(policy.gainMax / (1 + Math.exp(-delta / policy.gainScale)));
}

export function calculateCcLevel(solves: RatedSolve[], policy: LevelPolicy): CcLevelResult {
  const unique = new Map<string, RatedSolve & { inputIndex: number }>();
  solves.forEach((solve, inputIndex) => {
    if (solve.rating === null || unique.has(solve.problemKey)) return;
    unique.set(solve.problemKey, { ...solve, inputIndex });
  });

  const ordered = [...unique.values()].sort((left, right) => {
    const timeOrder = solveTime(left.solvedAt) - solveTime(right.solvedAt);
    if (timeOrder !== 0) return timeOrder;
    return (
      compareSubmissionIds(left.submissionId, right.submissionId) ||
      left.inputIndex - right.inputIndex
    );
  });

  let level = policy.initialLevel;
  for (const solve of ordered) {
    level += calculateCcLevelGain(Number(solve.rating), level, policy);
  }
  level = round4(level);

  // Legacy-shaped return while old database columns are retired gradually.
  return { calculated: level, coreLevel: level, masteryBonus: 0, level };
}

export interface RewardPolicy {
  min: number;
  max: number;
  midpointDelta: number;
  scale: number;
  maxPositiveDelta?: number;
}

export function calculateReward(
  problemRating: number,
  levelBefore: number,
  policy: RewardPolicy,
): number {
  const delta = Math.min(problemRating - levelBefore, policy.maxPositiveDelta ?? 500);
  const raw =
    policy.min +
    (policy.max - policy.min) / (1 + Math.exp(-((delta - policy.midpointDelta) / policy.scale)));
  return Math.min(policy.max, Math.max(policy.min, round2(raw)));
}

function solveTime(value: RatedSolve['solvedAt']): number {
  if (value === undefined) return Number.MAX_SAFE_INTEGER;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function compareSubmissionIds(
  left: RatedSolve['submissionId'],
  right: RatedSolve['submissionId'],
): number {
  if (left === undefined || right === undefined) return 0;
  try {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  } catch {
    return String(left).localeCompare(String(right));
  }
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
