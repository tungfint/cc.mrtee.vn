export interface CodeforcesProblem {
  contestId?: number;
  problemsetName?: string;
  index: string;
  name: string;
  type: string;
  rating?: number;
  tags: string[];
}

export interface CodeforcesAuthorMember {
  handle: string;
}

export interface CodeforcesParty {
  participantType?: string;
  members: CodeforcesAuthorMember[];
}

export interface CodeforcesSubmission {
  id: number;
  creationTimeSeconds: number;
  problem: CodeforcesProblem;
  author: CodeforcesParty;
  programmingLanguage?: string;
  verdict?: string;
}

export interface CodeforcesApiResponse<T> {
  status: 'OK' | 'FAILED';
  result?: T;
  comment?: string;
}

export function canonicalProblemKey(problem: CodeforcesProblem): string {
  if (problem.contestId !== undefined) return `contest:${problem.contestId}:${problem.index}`;
  if (problem.problemsetName) return `problemset:${problem.problemsetName}:${problem.index}`;
  throw new Error('Codeforces problem has no stable identity');
}

export function isIndividualSubmission(submission: CodeforcesSubmission): boolean {
  return submission.author.members.length === 1;
}

export function isQualifyingFirstSolve(submission: CodeforcesSubmission): boolean {
  return (
    submission.verdict === 'OK' &&
    submission.problem.type === 'PROGRAMMING' &&
    isIndividualSubmission(submission)
  );
}

export const CF_SYNC_QUEUE = 'cf-sync';
export const SYNC_PRIORITY = { HIGH: 1, LOW: 10 } as const;

export interface SyncJobData {
  userId: string;
  accountId: string;
  handle: string;
  mode: 'INCREMENTAL' | 'BACKFILL' | 'RECONCILE';
}
