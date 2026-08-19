import { describe, expect, it } from 'vitest';
import { recommendedRange } from './dashboard-recommendation';

describe('recommendedRange', () => {
  it('rounds the recent average to a 100-point center and recommends ±100', () => {
    expect(recommendedRange(1340)).toEqual({ average: 1340, min: 1200, max: 1400 });
    expect(recommendedRange(1360)).toEqual({ average: 1360, min: 1300, max: 1500 });
  });

  it('keeps recommendations inside the supported Codeforces rating range', () => {
    expect(recommendedRange(800)).toEqual({ average: 800, min: 800, max: 900 });
    expect(recommendedRange(3500)).toEqual({ average: 3500, min: 3400, max: 3500 });
    expect(recommendedRange(null)).toBeNull();
  });
});
