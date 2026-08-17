import { Injectable } from '@nestjs/common';
import { canonicalProblemKey, isIndividualSubmission, type CodeforcesSubmission } from '@cc/core';
import { DatabaseService } from '../database/database.service';

export interface IngestedSubmission {
  submissionId: bigint;
  problemKey: string;
  creationTime: Date;
  verdict: string;
  isTeam: boolean;
  ratingSnapshot: number | null;
  problemType: string;
}

@Injectable()
export class SubmissionIngestionService {
  constructor(private readonly database: DatabaseService) {}

  async ingest(userId: string, submission: CodeforcesSubmission): Promise<IngestedSubmission> {
    const problemKey = canonicalProblemKey(submission.problem);
    const creationTime = new Date(submission.creationTimeSeconds * 1000);
    const isTeam = !isIndividualSubmission(submission);
    const submissionId = BigInt(submission.id);

    return this.database.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO cf_problems (
          problem_key, contest_id, problemset_name, problem_index,
          name, type, current_rating, tags
        ) VALUES (
          ${problemKey},
          ${submission.problem.contestId ?? null},
          ${submission.problem.problemsetName ?? null},
          ${submission.problem.index},
          ${submission.problem.name},
          ${submission.problem.type},
          ${submission.problem.rating ?? null},
          ${submission.problem.tags}
        )
        ON CONFLICT (problem_key) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          current_rating = EXCLUDED.current_rating,
          tags = EXCLUDED.tags,
          updated_at = now()
      `;
      await transaction`
        INSERT INTO cf_submissions (
          cf_submission_id, user_id, problem_key, creation_time, verdict,
          participant_type, is_team, programming_language,
          problem_rating_observed, raw_metadata
        ) VALUES (
          ${submissionId.toString()},
          ${userId},
          ${problemKey},
          ${creationTime.toISOString()},
          ${submission.verdict ?? 'UNKNOWN'},
          ${submission.author.participantType ?? null},
          ${isTeam},
          ${submission.programmingLanguage ?? null},
          ${submission.problem.rating ?? null},
          ${JSON.stringify(submission)}::jsonb
        )
        ON CONFLICT (cf_submission_id) DO UPDATE SET
          verdict = EXCLUDED.verdict,
          participant_type = EXCLUDED.participant_type,
          is_team = EXCLUDED.is_team,
          programming_language = EXCLUDED.programming_language,
          problem_rating_observed = EXCLUDED.problem_rating_observed,
          raw_metadata = EXCLUDED.raw_metadata,
          last_seen_at = now()
      `;
      return {
        submissionId,
        problemKey,
        creationTime,
        verdict: submission.verdict ?? 'UNKNOWN',
        isTeam,
        ratingSnapshot: submission.problem.rating ?? null,
        problemType: submission.problem.type,
      };
    });
  }

  async ingestBatch(
    userId: string,
    submissions: CodeforcesSubmission[],
  ): Promise<IngestedSubmission[]> {
    const chronological = [...submissions].sort(
      (a, b) => a.creationTimeSeconds - b.creationTimeSeconds || a.id - b.id,
    );
    const results: IngestedSubmission[] = [];
    for (const submission of chronological) results.push(await this.ingest(userId, submission));
    return results;
  }
}
