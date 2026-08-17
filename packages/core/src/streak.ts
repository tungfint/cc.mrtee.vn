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
