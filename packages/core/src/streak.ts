export function longestDateStreak(dateKeys: string[]): number {
  const unique = [...new Set(dateKeys)].sort();
  let longest = 0;
  let current = 0;
  let previous: number | undefined;
  for (const key of unique) {
    const day = Date.parse(`${key}T00:00:00Z`) / 86_400_000;
    current = previous !== undefined && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

export function currentDateStreak(dateKeys: string[], todayKey: string): number {
  const days = [...new Set(dateKeys)]
    .map((key) => Date.parse(`${key}T00:00:00Z`) / 86_400_000)
    .sort((a, b) => b - a);
  if (days.length === 0) return 0;
  const today = Date.parse(`${todayKey}T00:00:00Z`) / 86_400_000;
  if (days[0] !== today && days[0] !== today - 1) return 0;
  let streak = 1;
  for (let index = 1; index < days.length && days[index] === days[index - 1]! - 1; index += 1) {
    streak += 1;
  }
  return streak;
}
