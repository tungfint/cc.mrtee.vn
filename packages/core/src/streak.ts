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

/** Thưởng của riêng ngày thứ `day` trong một chuỗi, tối đa 4 CC/ngày. */
export function calculateDailyStreakBonus(day: number): number {
  const streakDay = Math.max(0, Math.floor(day));
  if (streakDay < 1) return 0;
  const sevenDayMilestone = streakDay >= 7 ? 0.1 : 0;
  return Math.min(4, Math.round((1 + 0.15 * (streakDay - 1) + sevenDayMilestone) * 100) / 100);
}

/** Tổng thưởng lý thuyết từ ngày 1 tới hết một chuỗi. */
export function calculateStreakBonus(days: number): number {
  const length = Math.max(0, Math.floor(days));
  let total = 0;
  for (let day = 1; day <= length; day += 1) total += calculateDailyStreakBonus(day);
  return Math.round(total * 100) / 100;
}
