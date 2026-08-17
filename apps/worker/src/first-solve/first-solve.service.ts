import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { IngestedSubmission } from '../ingestion/submission-ingestion.service';

export interface FirstSolveResult {
  created: boolean;
  userId: string;
  problemKey: string;
  submissionId: bigint;
  firstSolvedAt: Date;
  ratingSnapshot: number | null;
  rewardEligible: boolean;
}

@Injectable()
export class FirstSolveService {
  constructor(private readonly database: DatabaseService) {}

  async record(
    userId: string,
    submission: IngestedSubmission,
    eligibleFrom: Date | null,
    historical = false,
  ): Promise<FirstSolveResult> {
    if (
      submission.verdict !== 'OK' ||
      submission.isTeam ||
      submission.problemType !== 'PROGRAMMING'
    ) {
      return this.notCreated(userId, submission);
    }

    return this.database.sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${submission.problemKey}`}, 0))
      `;
      const [canonical] = await transaction<
        {
          cf_submission_id: string;
          creation_time: Date | string;
          problem_rating_observed: number | null;
        }[]
      >`
        SELECT submissions.cf_submission_id, submissions.creation_time,
          submissions.problem_rating_observed
        FROM cf_submissions AS submissions
        JOIN cf_problems AS problems ON problems.problem_key = submissions.problem_key
        WHERE submissions.user_id = ${userId}
          AND submissions.problem_key = ${submission.problemKey}
          AND submissions.verdict = 'OK'
          AND submissions.is_team = false
          AND problems.type = 'PROGRAMMING'
        ORDER BY submissions.creation_time, submissions.cf_submission_id
        LIMIT 1
      `;
      if (!canonical) return this.notCreated(userId, submission);
      const canonicalTime = new Date(canonical.creation_time);
      const canonicalEligible =
        !historical &&
        eligibleFrom !== null &&
        canonicalTime >= eligibleFrom &&
        canonical.problem_rating_observed !== null;
      const [created] = await transaction<{ user_id: string }[]>`
        INSERT INTO user_problem_solves (
          user_id, problem_key, first_ok_submission_id, first_solved_at,
          rating_snapshot, reward_eligible
        ) VALUES (
          ${userId},
          ${submission.problemKey},
          ${canonical.cf_submission_id},
          ${canonicalTime.toISOString()},
          ${canonical.problem_rating_observed},
          ${canonicalEligible}
        )
        ON CONFLICT (user_id, problem_key) DO NOTHING
        RETURNING user_id
      `;
      return {
        created: Boolean(created),
        userId,
        problemKey: submission.problemKey,
        submissionId: BigInt(canonical.cf_submission_id),
        firstSolvedAt: canonicalTime,
        ratingSnapshot: canonical.problem_rating_observed,
        rewardEligible: canonicalEligible,
      };
    });
  }

  async recordBatch(
    userId: string,
    submissions: IngestedSubmission[],
    eligibleFrom: Date | null,
    historical: boolean,
  ): Promise<FirstSolveResult[]> {
    const results: FirstSolveResult[] = [];
    for (const submission of submissions) {
      results.push(await this.record(userId, submission, eligibleFrom, historical));
    }
    return results;
  }

  private notCreated(userId: string, submission: IngestedSubmission): FirstSolveResult {
    return {
      created: false,
      userId,
      problemKey: submission.problemKey,
      submissionId: submission.submissionId,
      firstSolvedAt: submission.creationTime,
      ratingSnapshot: submission.ratingSnapshot,
      rewardEligible: false,
    };
  }
}
