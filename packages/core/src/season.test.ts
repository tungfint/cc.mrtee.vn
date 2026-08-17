import { describe, expect, it } from 'vitest';
import { isEventInSeason } from './season';

describe('season event-time boundaries', () => {
  const start = new Date('2026-08-01T00:00:00.000Z');
  const end = new Date('2026-09-01T00:00:00.000Z');

  it.each([
    ['start - 1ms', new Date(start.getTime() - 1), false],
    ['start', start, true],
    ['end - 1ms', new Date(end.getTime() - 1), true],
    ['end', end, false],
  ])('%s is assigned correctly', (_label, event, expected) => {
    expect(isEventInSeason(event, start, end)).toBe(expected);
  });
});
