export function isEventInSeason(eventAt: Date, startAt: Date, endAt: Date): boolean {
  return eventAt >= startAt && eventAt < endAt;
}
