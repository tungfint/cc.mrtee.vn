import { BadRequestException, Injectable } from '@nestjs/common';
import { calculateStreakBonus, currentDateStreak, longestDateStreak } from '@cc/core';
import { DatabaseService } from '../database/database.service';

export interface StreakDay {
  date: string;
  kind: 'SOLVE' | 'RESCUE';
  problemName: string | null;
  problemRating: number | null;
  submissionId: string | null;
  codeforcesUrl: string | null;
  mascotName: string | null;
  mascotImageUrl: string | null;
}

interface ActivitySummary {
  today: string;
  allDays: StreakDay[];
  currentStreak: number;
  longestStreak: number;
  timeline: StreakDay[];
  missingDates: string[];
}

@Injectable()
export class StreakService {
  constructor(private readonly database: DatabaseService) {}

  async summary(userId: string) {
    const activity = await this.activity(this.database.sql, userId);
    const [mascots, [bonus]] = await Promise.all([
      this.database.sql`
        SELECT orders.id AS order_id, rewards.id AS reward_id, rewards.name,
          rewards.image_url, orders.reviewed_at AS acquired_at
        FROM reward_orders AS orders
        JOIN rewards ON rewards.id = orders.reward_id
        LEFT JOIN streak_rescues AS rescues ON rescues.reward_order_id = orders.id
        WHERE orders.user_id = ${userId} AND orders.status = 'FULFILLED'
          AND rewards.category = 'MASCOT' AND rescues.id IS NULL
        ORDER BY orders.reviewed_at, orders.created_at, orders.id
      `,
      this.database.sql<{ settled_bonus: string }[]>`
        SELECT COALESCE(sum(amount), 0)::text AS settled_bonus
        FROM point_transactions
        WHERE user_id = ${userId} AND type = 'BONUS'
          AND metadata ->> 'source' = 'STREAK'
      `,
    ]);
    return {
      currentStreak: activity.currentStreak,
      longestStreak: activity.longestStreak,
      pendingBonus: calculateStreakBonus(activity.currentStreak),
      settledBonus: Number(bonus?.settled_bonus ?? 0),
      timeline: activity.timeline,
      rescue: {
        missingDates: activity.missingDates,
        requiredMascots: activity.missingDates.length,
        available: activity.missingDates.length > 0,
        maxDays: 3,
        mascots,
      },
      bonusMilestones: [
        { days: 2, ccPoint: calculateStreakBonus(2) },
        { days: 7, ccPoint: calculateStreakBonus(7) },
        { days: 14, ccPoint: calculateStreakBonus(14) },
        { days: 30, ccPoint: calculateStreakBonus(30) },
        { days: 60, ccPoint: calculateStreakBonus(60) },
      ],
    };
  }

  async rescue(userId: string, rewardOrderIds: string[]) {
    return this.database.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`streak:${userId}`}, 0))`;
      const activity = await this.activity(transaction, userId);
      if (!activity.missingDates.length) {
        throw new BadRequestException(
          'Hiện không có khoảng trống Streak hợp lệ để cứu. Hãy giải bài trong ngày rồi thử lại.',
        );
      }
      if (rewardOrderIds.length !== activity.missingDates.length) {
        throw new BadRequestException(
          `Cần chọn đúng ${activity.missingDates.length} linh vật cho ${activity.missingDates.length} ngày bị thiếu`,
        );
      }
      if (new Set(rewardOrderIds).size !== rewardOrderIds.length) {
        throw new BadRequestException('Mỗi linh vật chỉ được chọn một lần');
      }
      const owned = await transaction<{ id: string; name: string }[]>`
        SELECT orders.id, rewards.name
        FROM reward_orders AS orders
        JOIN rewards ON rewards.id = orders.reward_id
        LEFT JOIN streak_rescues AS rescues ON rescues.reward_order_id = orders.id
        WHERE orders.user_id = ${userId} AND orders.status = 'FULFILLED'
          AND rewards.category = 'MASCOT' AND rescues.id IS NULL
          AND orders.id = ANY(${rewardOrderIds}::uuid[])
        FOR UPDATE OF orders
      `;
      if (owned.length !== rewardOrderIds.length) {
        throw new BadRequestException(
          'Có linh vật không thuộc sở hữu, chưa được giao hoặc đã hi sinh',
        );
      }
      const nameByOrder = new Map(owned.map((item) => [item.id, item.name]));
      for (const [index, rescuedDate] of activity.missingDates.entries()) {
        const orderId = rewardOrderIds[index]!;
        await transaction`
          INSERT INTO streak_rescues (user_id, reward_order_id, rescued_date)
          VALUES (${userId}, ${orderId}, ${rescuedDate})
        `;
      }
      const after = {
        rescuedDates: activity.missingDates,
        mascots: rewardOrderIds.map((id) => ({ orderId: id, name: nameByOrder.get(id) })),
      };
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
        VALUES (${userId}, 'STREAK_RESCUED', 'user', ${userId},
          ${JSON.stringify(after)}::jsonb, 'Học sinh hi sinh linh vật để nối lại chuỗi Streak')
      `;
      return { success: true, ...after };
    });
  }

  private async activity(
    sql: DatabaseService['sql'] | import('postgres').TransactionSql,
    userId: string,
  ): Promise<ActivitySummary> {
    const [clock] = await sql<{ today: string }[]>`
      SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM users WHERE id = ${userId}
    `;
    if (!clock) throw new BadRequestException('Không tìm thấy học sinh');
    const solveDays = await sql<
      {
        day: string;
        problem_name: string;
        rating_snapshot: number | null;
        first_ok_submission_id: string;
        contest_id: string | null;
      }[]
    >`
      SELECT DISTINCT ON ((solves.first_solved_at AT TIME ZONE users.timezone)::date)
        (solves.first_solved_at AT TIME ZONE users.timezone)::date::text AS day,
        problems.name AS problem_name, solves.rating_snapshot,
        solves.first_ok_submission_id::text, problems.contest_id::text
      FROM user_problem_solves AS solves
      JOIN users ON users.id = solves.user_id
      JOIN cf_problems AS problems ON problems.problem_key = solves.problem_key
      WHERE solves.user_id = ${userId}
      ORDER BY (solves.first_solved_at AT TIME ZONE users.timezone)::date,
        solves.first_solved_at, solves.first_ok_submission_id
    `;
    const rescueDays = await sql<
      { day: string; mascot_name: string; mascot_image_url: string | null }[]
    >`
      SELECT rescues.rescued_date::text AS day, rewards.name AS mascot_name,
        rewards.image_url AS mascot_image_url
      FROM streak_rescues AS rescues
      JOIN reward_orders AS orders ON orders.id = rescues.reward_order_id
      JOIN rewards ON rewards.id = orders.reward_id
      WHERE rescues.user_id = ${userId}
      ORDER BY rescues.rescued_date
    `;
    const allDays: StreakDay[] = [
      ...solveDays.map((item) => ({
        date: item.day,
        kind: 'SOLVE' as const,
        problemName: item.problem_name,
        problemRating: item.rating_snapshot,
        submissionId: item.first_ok_submission_id,
        codeforcesUrl: item.contest_id
          ? `https://codeforces.com/${Number(item.contest_id) >= 100000 ? 'gym' : 'contest'}/${item.contest_id}/submission/${item.first_ok_submission_id}`
          : `https://codeforces.com/submissions/${item.first_ok_submission_id}`,
        mascotName: null,
        mascotImageUrl: null,
      })),
      ...rescueDays.map((item) => ({
        date: item.day,
        kind: 'RESCUE' as const,
        problemName: null,
        problemRating: null,
        submissionId: null,
        codeforcesUrl: null,
        mascotName: item.mascot_name,
        mascotImageUrl: item.mascot_image_url,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const dateKeys = allDays.map((item) => item.date);
    const currentStreak = currentDateStreak(dateKeys, clock.today);
    const timeline = currentStreak > 0 ? allDays.slice(-currentStreak) : [];
    const missingDates = this.rescuableGap(
      allDays,
      solveDays.map((item) => item.day),
      clock.today,
    );
    return {
      today: clock.today,
      allDays,
      currentStreak,
      longestStreak: longestDateStreak(dateKeys),
      timeline,
      missingDates,
    };
  }

  private rescuableGap(allDays: StreakDay[], solveDates: string[], today: string): string[] {
    if (!solveDates.includes(today)) return [];
    const days = [...new Set(allDays.map((item) => item.date))].sort();
    let islandStart = today;
    while (true) {
      const previous = this.shiftDate(islandStart, -1);
      if (!days.includes(previous)) break;
      islandStart = previous;
    }
    const prior = [...days].reverse().find((day) => day < islandStart);
    if (!prior) return [];
    const missing: string[] = [];
    for (let day = this.shiftDate(prior, 1); day < islandStart; day = this.shiftDate(day, 1)) {
      missing.push(day);
    }
    if (missing.length < 1 || missing.length > 3) return [];
    if (missing[0]! < this.shiftDate(today, -3)) return [];
    return missing;
  }

  private shiftDate(date: string, amount: number) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  }
}
