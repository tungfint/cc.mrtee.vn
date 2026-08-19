export function recommendedRange(average: number | null) {
  if (average === null || !Number.isFinite(average)) return null;
  const center = Math.round(average / 100) * 100;
  return {
    average,
    min: Math.max(800, center - 100),
    max: Math.min(3500, center + 100),
  };
}
