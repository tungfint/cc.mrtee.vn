import { describe, expect, it } from 'vitest';
import {
  canonicalProblemKey,
  isQualifyingFirstSolve,
  type CodeforcesSubmission,
} from './codeforces';

const submission = (overrides: Partial<CodeforcesSubmission> = {}): CodeforcesSubmission => ({
  id: 1,
  creationTimeSeconds: 1_700_000_000,
  problem: { contestId: 1000, index: 'A', name: 'Test', type: 'PROGRAMMING', tags: [] },
  author: { participantType: 'PRACTICE', members: [{ handle: 'student' }] },
  verdict: 'OK',
  ...overrides,
});

describe('Codeforces normalization', () => {
  it('uses contest and problemset stable identities without problem names', () => {
    expect(canonicalProblemKey(submission().problem)).toBe('contest:1000:A');
    expect(
      canonicalProblemKey({
        problemsetName: 'acmsguru',
        index: '1',
        name: 'Renamed',
        type: 'PROGRAMMING',
        tags: [],
      }),
    ).toBe('problemset:acmsguru:1');
  });

  it('excludes team, non-OK, and non-programming submissions from first solves', () => {
    expect(isQualifyingFirstSolve(submission())).toBe(true);
    expect(
      isQualifyingFirstSolve(
        submission({ author: { members: [{ handle: 'one' }, { handle: 'two' }] } }),
      ),
    ).toBe(false);
    expect(isQualifyingFirstSolve(submission({ verdict: 'WRONG_ANSWER' }))).toBe(false);
  });
});
