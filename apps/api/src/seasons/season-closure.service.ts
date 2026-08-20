import { BadRequestException, Injectable } from '@nestjs/common';
import { calculateCcLevel, longestDateStreak } from '@cc/core';
import type postgres from 'postgres';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';

interface SeasonRow {
  id: string;
  organization_id: string | null;
  status: string;
  start_at: Date | string;
  end_at: Date | string;
  scoring_policy_version: string;
}

interface ParticipantRow {
  user_id: string;
  earned: string;
  bonus: string;
  penalty: string;
  score: string;
  qualifying_solves: number;
  reached_score_at: Date | string | null;
  cc_base: string;
  cc_level: string;
  timezone: string;
}

interface SnapshotCandidate {
  userId: string;
  ccLevelStart: number;
  ccLevelEnd: number;
  growth: number;
  score: number;
  qualifyingSolves: number;
  activeDays: number;
  longestStreak: number;
  maxChallengeDelta: number | null;
  reachedScoreAt: number;
  finalRank: number;
}

@Injectable()
export class SeasonClosureService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  async close(seasonId: string, actor: AuthUser, reason: string) {
    const [season] = await this.database.sql<SeasonRow[]>`
      SELECT * FROM seasons WHERE id = ${seasonId}
    `;
    if (!season) throw new BadRequestException('Không tìm thấy season');
    if (season.organization_id) {
      const access = await this.authorization.organizationAccess(season.organization_id, actor);
      this.authorization.assertCanManage(access, actor);
    } else if (actor.systemRole === 'USER') {
      throw new BadRequestException('Không đủ quyền đóng season');
    }
    if (season.status !== 'CLOSING') {
      throw new BadRequestException('Season phải ở trạng thái CLOSING');
    }

    return this.database.sql.begin(async (transaction) => {
      await transaction`SELECT id FROM seasons WHERE id = ${seasonId} FOR UPDATE`;
      const participants = await transaction<ParticipantRow[]>`
        SELECT totals.*, skill.cc_base, skill.cc_level, users.timezone
        FROM season_user_totals AS totals
        JOIN users ON users.id = totals.user_id
        JOIN user_skill_state AS skill ON skill.user_id = totals.user_id
        WHERE totals.season_id = ${seasonId}
      `;
      const [policy] = await transaction<{ level_decay: string; level_denominator: string }[]>`
        SELECT level_decay, level_denominator FROM scoring_policies
        WHERE version = ${season.scoring_policy_version}
      `;
      if (!policy) throw new Error('Scoring policy is unavailable');

      const candidates: SnapshotCandidate[] = [];
      for (const participant of participants) {
        const historical = await transaction<{ problem_key: string; rating_snapshot: number }[]>`
          SELECT problem_key, rating_snapshot FROM user_problem_solves
          WHERE user_id = ${participant.user_id}
            AND rating_snapshot IS NOT NULL
            AND first_solved_at < ${new Date(season.start_at).toISOString()}
        `;
        const startLevel = calculateCcLevel(
          historical.map((solve) => ({
            problemKey: solve.problem_key,
            rating: Number(solve.rating_snapshot),
          })),
          {
            decay: Number(policy.level_decay),
            denominator: Number(policy.level_denominator),
            base: Number(participant.cc_base),
          },
        ).level;
        const dates = await transaction<{ day: string }[]>`
          SELECT DISTINCT to_char(
            first_solved_at AT TIME ZONE ${participant.timezone}, 'YYYY-MM-DD'
          ) AS day
          FROM user_problem_solves
          WHERE user_id = ${participant.user_id}
            AND first_solved_at >= ${new Date(season.start_at).toISOString()}
            AND first_solved_at < ${new Date(season.end_at).toISOString()}
        `;
        const [challenge] = await transaction<{ maximum: string | null }[]>`
          SELECT max(problem_rating_snapshot - cc_level_before)::text AS maximum
          FROM point_transactions
          WHERE season_id = ${seasonId} AND user_id = ${participant.user_id} AND type = 'EARN'
        `;
        const ccLevelEnd = Number(participant.cc_level);
        candidates.push({
          userId: participant.user_id,
          ccLevelStart: startLevel,
          ccLevelEnd,
          growth: Math.round((ccLevelEnd - startLevel) * 100) / 100,
          score: Number(participant.score),
          qualifyingSolves: participant.qualifying_solves,
          activeDays: dates.length,
          longestStreak: longestDateStreak(dates.map((entry) => entry.day)),
          maxChallengeDelta: challenge?.maximum === null ? null : Number(challenge?.maximum),
          reachedScoreAt: participant.reached_score_at
            ? new Date(participant.reached_score_at).getTime()
            : Number.MAX_SAFE_INTEGER,
          finalRank: 0,
        });
      }
      candidates
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.qualifyingSolves - a.qualifyingSolves ||
            b.ccLevelEnd - a.ccLevelEnd ||
            a.reachedScoreAt - b.reachedScoreAt,
        )
        .forEach((candidate, index) => {
          candidate.finalRank = index + 1;
        });

      for (const candidate of candidates) {
        await transaction`
          INSERT INTO season_user_snapshots (
            season_id, user_id, cc_level_start, cc_level_end, cc_level_growth,
            season_score, qualifying_solves, active_days, longest_streak,
            max_challenge_delta, final_rank, closed_at
          ) VALUES (
            ${seasonId}, ${candidate.userId}, ${candidate.ccLevelStart}, ${candidate.ccLevelEnd},
            ${candidate.growth}, ${candidate.score}, ${candidate.qualifyingSolves},
            ${candidate.activeDays}, ${candidate.longestStreak}, ${candidate.maxChallengeDelta},
            ${candidate.finalRank}, now()
          ) ON CONFLICT (season_id, user_id) DO NOTHING
        `;
      }
      await this.createAwards(transaction, seasonId, candidates, actor.userId);
      const [closed] = await transaction`
        UPDATE seasons SET status = 'CLOSED', updated_at = now()
        WHERE id = ${seasonId} AND status = 'CLOSING'
        RETURNING *
      `;
      if (!closed) throw new BadRequestException('Season đã thay đổi trạng thái');
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, after, reason
        ) VALUES (
          ${actor.userId}, 'SEASON_CLOSED', 'season', ${seasonId},
          ${JSON.stringify(closed)}::jsonb, ${reason}
        )
      `;
      return { season: closed, snapshots: candidates.length };
    });
  }

  private async createAwards(
    transaction: postgres.TransactionSql,
    seasonId: string,
    candidates: SnapshotCandidate[],
    actorId: string,
  ): Promise<void> {
    const definitions = [
      ['TOP_SCORE', 'Top Score', [...candidates].sort((a, b) => a.finalRank - b.finalRank)[0]],
      [
        'MOST_IMPROVED',
        'Most Improved',
        [...candidates].sort(
          (a, b) =>
            b.growth - a.growth || b.score - a.score || b.qualifyingSolves - a.qualifyingSolves,
        )[0],
      ],
      [
        'MOST_CONSISTENT',
        'Most Consistent',
        [...candidates].sort(
          (a, b) =>
            b.activeDays - a.activeDays ||
            b.longestStreak - a.longestStreak ||
            b.qualifyingSolves - a.qualifyingSolves,
        )[0],
      ],
      [
        'CHALLENGE',
        'Challenge',
        [...candidates].sort(
          (a, b) => (b.maxChallengeDelta ?? -Infinity) - (a.maxChallengeDelta ?? -Infinity),
        )[0],
      ],
    ] as const;
    for (const [awardType, title, winner] of definitions) {
      if (!winner) continue;
      await transaction`
        INSERT INTO season_awards (
          season_id, user_id, award_type, rank, title, awarded_by
        ) VALUES (${seasonId}, ${winner.userId}, ${awardType}, 1, ${title}, ${actorId})
        ON CONFLICT DO NOTHING
      `;
    }
  }
}
