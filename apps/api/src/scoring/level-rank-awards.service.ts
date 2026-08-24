import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

export type LevelRankAwardSource = 'SOLVE' | 'RECALIBRATION' | 'ADMIN';

@Injectable()
export class LevelRankAwardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async awardCrossedRanks(
    transaction: import('postgres').TransactionSql,
    input: {
      userId: string;
      levelBefore: number;
      levelAfter: number;
      source: LevelRankAwardSource;
      actorUserId?: string | null;
    },
  ) {
    if (input.levelAfter <= input.levelBefore) return [];
    const ranks = await transaction<
      { id: string; min_level: number; name: string; reward_point: string }[]
    >`
      SELECT id, min_level, name, reward_point::text
      FROM cc_level_ranks
      WHERE active = true
        AND min_level::numeric > ${input.levelBefore}::numeric
        AND min_level::numeric <= ${input.levelAfter}::numeric
      ORDER BY min_level
    `;
    const awarded: Array<{ rankId: string; name: string; rewardPoint: number }> = [];
    for (const rank of ranks) {
      const [record] = await transaction<{ id: string }[]>`
        INSERT INTO user_level_rank_awards (user_id, rank_id, achieved_level, source)
        VALUES (${input.userId}, ${rank.id}, ${input.levelAfter}, ${input.source})
        ON CONFLICT (user_id, rank_id) DO NOTHING
        RETURNING id
      `;
      if (!record) continue;
      const rewardPoint = Number(rank.reward_point);
      if (rewardPoint > 0) {
        const [pointTransaction] = await transaction<{ id: string }[]>`
          INSERT INTO point_transactions (
            user_id, type, amount, idempotency_key, affects_wallet, affects_point,
            affects_season, description, metadata, event_at
          ) VALUES (
            ${input.userId}, 'BONUS', ${rewardPoint}, ${`level-rank:${input.userId}:${rank.id}`},
            true, true, false, ${`Thưởng lần đầu đạt cấp bậc ${rank.name}`},
            ${JSON.stringify({
              source: 'CC_LEVEL_RANK',
              rankId: rank.id,
              rankName: rank.name,
              minLevel: rank.min_level,
              achievedLevel: input.levelAfter,
            })}::jsonb,
            now()
          ) ON CONFLICT DO NOTHING RETURNING id
        `;
        if (pointTransaction) {
          await transaction`
            UPDATE user_level_rank_awards SET point_transaction_id = ${pointTransaction.id}
            WHERE id = ${record.id}
          `;
          await transaction`
            INSERT INTO user_wallets (user_id, balance) VALUES (${input.userId}, ${rewardPoint})
            ON CONFLICT (user_id) DO UPDATE SET
              balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
          `;
        }
      }
      await this.notifications.createForUser(transaction, {
        userId: input.userId,
        title: `Chúc mừng đạt cấp bậc ${rank.name}`,
        body:
          rewardPoint > 0
            ? `Bạn lần đầu đạt cấp bậc ${rank.name} và nhận ${rewardPoint} CC Point cùng ${rewardPoint} CC Balance.`
            : `Bạn đã lần đầu đạt cấp bậc ${rank.name}.`,
        createdBy: input.actorUserId ?? null,
      });
      awarded.push({ rankId: rank.id, name: rank.name, rewardPoint });
    }
    return awarded;
  }
}
