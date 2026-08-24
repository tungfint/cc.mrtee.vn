import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface RewardRow {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  active: boolean;
  image_url: string | null;
  cash_value_vnd: number | null;
  category: 'STANDARD' | 'MASCOT' | 'ACHIEVEMENT';
  required_cc_level: number;
  requires_approval: boolean;
  achievement_id: string | null;
}

export interface OrderRow {
  id: string;
  user_id: string;
  reward_id: string;
  cost_snapshot: string;
  status: 'REQUESTED' | 'APPROVED' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';
  idempotency_key: string;
  recipient_user_id: string | null;
}

type TerminalStatus = 'REJECTED' | 'CANCELLED';

@Injectable()
export class RewardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async catalog(userId?: string) {
    return this.database.sql<RewardRow[]>`
      SELECT rewards.id, rewards.name, rewards.description, rewards.cost, rewards.stock,
        rewards.active, rewards.image_url, rewards.cash_value_vnd, rewards.category,
        rewards.required_cc_level, rewards.requires_approval, rewards.achievement_id,
        achievements.name AS achievement_name, achievements.icon AS achievement_icon,
        achievements.tier AS achievement_tier, achievements.color AS achievement_color,
        COALESCE(owned.quantity, 0)::int AS owned_quantity
      FROM rewards
      LEFT JOIN achievements ON achievements.id = rewards.achievement_id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS quantity
        FROM reward_orders AS orders
        LEFT JOIN streak_rescues AS rescues ON rescues.reward_order_id = orders.id
        WHERE orders.reward_id = rewards.id
          AND COALESCE(orders.recipient_user_id, orders.user_id) = ${userId ?? null}
          AND orders.status = 'FULFILLED' AND rescues.id IS NULL
      ) AS owned ON true
      WHERE rewards.active = true AND (rewards.stock IS NULL OR rewards.stock > 0)
      ORDER BY rewards.cost, rewards.name
    `;
  }

  async walletBalance(userId?: string) {
    if (!userId) return null;
    const [wallet] = await this.database.sql<{ balance: string }[]>`
      SELECT balance::text FROM user_wallets WHERE user_id = ${userId}
    `;
    return wallet?.balance ?? '0.00';
  }

  async orders(userId: string) {
    const [orders, [cashSummary]] = await Promise.all([
      this.database.sql`
        SELECT orders.*, rewards.name AS reward_name, rewards.image_url, rewards.cash_value_vnd,
          purchasers.display_name AS purchaser_name, recipients.display_name AS recipient_name,
          CASE WHEN orders.user_id = ${userId} THEN 'SENT' ELSE 'RECEIVED' END AS gift_direction
        FROM reward_orders AS orders
        JOIN rewards ON rewards.id = orders.reward_id
        JOIN users AS purchasers ON purchasers.id = orders.user_id
        LEFT JOIN users AS recipients ON recipients.id = orders.recipient_user_id
        WHERE orders.user_id = ${userId} OR orders.recipient_user_id = ${userId}
        ORDER BY orders.created_at DESC
      `,
      this.database.sql<{ fulfilled_count: number; fulfilled_vnd: string }[]>`
        SELECT count(*) FILTER (WHERE orders.status = 'FULFILLED')::int AS fulfilled_count,
          COALESCE(sum(rewards.cash_value_vnd) FILTER (WHERE orders.status = 'FULFILLED'), 0)::text
            AS fulfilled_vnd
        FROM reward_orders AS orders
        JOIN rewards ON rewards.id = orders.reward_id
        WHERE COALESCE(orders.recipient_user_id, orders.user_id) = ${userId}
          AND rewards.cash_value_vnd IS NOT NULL
      `,
    ]);
    return {
      orders,
      cashSummary: {
        fulfilledCount: cashSummary?.fulfilled_count ?? 0,
        fulfilledValueVnd: Number(cashSummary?.fulfilled_vnd ?? 0),
      },
    };
  }

  async redeem(userId: string, rewardId: string, clientKey: string) {
    return this.purchase(userId, null, rewardId, clientKey, '');
  }

  async gift(
    purchaserUserId: string,
    recipientUserId: string,
    rewardId: string,
    clientKey: string,
    message: string,
  ) {
    if (purchaserUserId === recipientUserId) {
      throw new BadRequestException('Hãy dùng nút Đổi ngay khi tự nhận phần thưởng');
    }
    return this.purchase(purchaserUserId, recipientUserId, rewardId, clientKey, message);
  }

  async giftRecipients(userId: string) {
    return {
      users: await this.database.sql`
        SELECT users.id, users.display_name, users.avatar_url,
          accounts.handle AS codeforces_handle, accounts.current_rating
        FROM users
        LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
        WHERE users.status = 'ACTIVE' AND users.id <> ${userId}
        ORDER BY users.display_name, users.id
        LIMIT 1000
      `,
    };
  }

  private async purchase(
    userId: string,
    recipientUserId: string | null,
    rewardId: string,
    clientKey: string,
    giftMessage: string,
  ) {
    const idempotencyKey = `${recipientUserId ? 'gift' : 'redeem'}:${userId}:${clientKey}`;
    return this.database.sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
      `;
      const [existing] = await transaction<OrderRow[]>`
        SELECT * FROM reward_orders WHERE idempotency_key = ${idempotencyKey}
      `;
      if (existing) {
        if (
          existing.reward_id !== rewardId ||
          (existing.recipient_user_id ?? null) !== recipientUserId
        ) {
          throw new ConflictException('Khóa idempotency đã được dùng cho phần thưởng khác');
        }
        return { order: existing, replayed: true };
      }

      await transaction`
        INSERT INTO user_wallets (user_id, balance)
        VALUES (${userId}, 0) ON CONFLICT (user_id) DO NOTHING
      `;
      const [wallet] = await transaction<{ balance: string }[]>`
        SELECT balance FROM user_wallets WHERE user_id = ${userId} FOR UPDATE
      `;
      const [reward] = await transaction<RewardRow[]>`
        SELECT id, name, description, cost, stock, active, image_url, cash_value_vnd,
          category, required_cc_level, requires_approval, achievement_id
        FROM rewards WHERE id = ${rewardId} FOR UPDATE
      `;
      if (!reward || !reward.active) throw new NotFoundException('Phần thưởng không khả dụng');
      if (recipientUserId) {
        if (reward.cash_value_vnd !== null) {
          throw new BadRequestException('Không hỗ trợ tặng quy đổi tiền mặt cho tài khoản khác');
        }
        const [recipient] = await transaction`
          SELECT id FROM users WHERE id = ${recipientUserId} AND status = 'ACTIVE'
        `;
        if (!recipient) throw new BadRequestException('Không tìm thấy người nhận đang hoạt động');
      }
      if (reward.stock !== null && reward.stock <= 0) {
        throw new BadRequestException('Phần thưởng đã hết');
      }
      if (reward.required_cc_level > 0) {
        const [skill] = await transaction<{ cc_level: string }[]>`
          SELECT cc_level::text FROM user_skill_state
          WHERE user_id = ${recipientUserId ?? userId}
        `;
        const currentLevel = Number(skill?.cc_level ?? 800);
        if (currentLevel < reward.required_cc_level) {
          throw new BadRequestException(
            recipientUserId
              ? `Người nhận cần đạt CC Level ${reward.required_cc_level} để nhận phần thưởng này`
              : `Cần đạt CC Level ${reward.required_cc_level} để nhận phần thưởng này`,
          );
        }
      }
      const cost = Number(reward.cost);
      if (!wallet || Number(wallet.balance) < cost) {
        throw new BadRequestException('Số dư không đủ để đổi phần thưởng');
      }

      const initialStatus: OrderRow['status'] = reward.requires_approval
        ? 'REQUESTED'
        : 'FULFILLED';
      const [order] = await transaction<OrderRow[]>`
        INSERT INTO reward_orders (
          user_id, recipient_user_id, reward_id, cost_snapshot, idempotency_key, status,
          reviewed_at, note, gift_message
        ) VALUES (
          ${userId}, ${recipientUserId}, ${reward.id}, ${reward.cost}, ${idempotencyKey},
          ${initialStatus},
          CASE WHEN ${!reward.requires_approval} THEN now() ELSE NULL END,
          ${reward.requires_approval ? null : 'Tự động hoàn tất — phần thưởng không yêu cầu xác nhận'},
          ${giftMessage || null}
        )
        RETURNING *
      `;
      if (!order) throw new Error('Failed to create reward order');
      await transaction`
        INSERT INTO point_transactions (
          user_id, type, amount, source_reward_order_id, idempotency_key,
          affects_wallet, affects_point, affects_season, description, event_at
        ) VALUES (
          ${userId}, 'REDEEM', ${-cost}, ${order.id}, ${`ledger:${idempotencyKey}`},
          true, false, false,
          ${recipientUserId ? `Tặng quà: ${reward.name}` : `Đổi thưởng: ${reward.name}`}, now()
        )
      `;
      await transaction`
        UPDATE user_wallets
        SET balance = balance - ${cost}, updated_at = now()
        WHERE user_id = ${userId}
      `;
      if (reward.stock !== null) {
        await transaction`
          UPDATE rewards SET stock = stock - 1, updated_at = now() WHERE id = ${reward.id}
        `;
      }
      if (!reward.requires_approval && reward.achievement_id) {
        await transaction`
          INSERT INTO user_achievements (
            user_id, achievement_id, source, reward_order_id, note
          ) VALUES (
            ${recipientUserId ?? userId}, ${reward.achievement_id}, 'REWARD', ${order.id},
            'Tự động trao danh hiệu sau khi đổi thưởng'
          ) ON CONFLICT (user_id, achievement_id) DO NOTHING
        `;
      }
      if (recipientUserId) {
        const [purchaser] = await transaction<{ display_name: string }[]>`
          SELECT display_name FROM users WHERE id = ${userId}
        `;
        await this.notifications.createForUser(transaction, {
          userId: recipientUserId,
          title: 'Bạn vừa được tặng quà',
          body: `${purchaser?.display_name ?? 'Một thành viên'} đã tặng bạn “${reward.name}”.${giftMessage ? ` Lời nhắn: ${giftMessage}` : ''}${reward.requires_approval ? ' Quà đang chờ xác nhận.' : ' Quà đã được ghi nhận vào hồ sơ.'}`,
          createdBy: userId,
        });
      }
      return { order, replayed: false };
    });
  }

  async transitionOrder(
    orderId: string,
    status: OrderRow['status'],
    actor: AuthUser,
    note: string,
  ) {
    return this.database.sql.begin(async (transaction) => {
      const [order] = await transaction<OrderRow[]>`
        SELECT * FROM reward_orders WHERE id = ${orderId} FOR UPDATE
      `;
      if (!order) throw new NotFoundException('Không tìm thấy đơn đổi thưởng');
      const isOwnerCancellation = status === 'CANCELLED' && order.user_id === actor.userId;
      if (!isOwnerCancellation && actor.systemRole === 'USER') {
        throw new BadRequestException('Không đủ quyền xử lý đơn đổi thưởng');
      }
      if (order.status === status) return { order, replayed: true };
      const valid =
        (order.status === 'REQUESTED' && ['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) ||
        (order.status === 'APPROVED' && ['FULFILLED', 'REJECTED', 'CANCELLED'].includes(status));
      if (!valid) throw new BadRequestException('Chuyển trạng thái đơn không hợp lệ');

      if (['REJECTED', 'CANCELLED'].includes(status)) {
        await this.refund(transaction, order, status as TerminalStatus);
      }
      const [updated] = await transaction<OrderRow[]>`
        UPDATE reward_orders
        SET status = ${status}, reviewed_at = now(), reviewed_by = ${actor.userId}, note = ${note}
        WHERE id = ${order.id} AND status = ${order.status}
        RETURNING *
      `;
      if (!updated) throw new ConflictException('Đơn đã thay đổi trạng thái');
      if (status === 'FULFILLED') {
        const beneficiaryUserId = order.recipient_user_id ?? order.user_id;
        await transaction`
          INSERT INTO user_achievements (
            user_id, achievement_id, source, reward_order_id, granted_by, note
          )
          SELECT ${beneficiaryUserId}::uuid, rewards.achievement_id,
            'REWARD', ${order.id},
            ${actor.userId}, ${note}
          FROM rewards
          WHERE rewards.id = ${order.reward_id} AND rewards.category = 'ACHIEVEMENT'
            AND rewards.achievement_id IS NOT NULL
          ON CONFLICT (user_id, achievement_id) DO NOTHING
        `;
      }
      await this.notifications.createForUser(transaction, {
        userId: order.recipient_user_id ?? order.user_id,
        title: 'Trạng thái quà đã được cập nhật',
        body: `Yêu cầu quà của bạn đã chuyển sang trạng thái ${status}. Ghi chú: ${note}`,
        createdBy: actor.userId,
      });
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, before, after, reason
        ) VALUES (
          ${actor.userId}, 'REWARD_ORDER_STATUS_CHANGED', 'reward_order', ${order.id},
          ${JSON.stringify(order)}::jsonb, ${JSON.stringify(updated)}::jsonb, ${note}
        )
      `;
      return { order: updated, replayed: false };
    });
  }

  private async refund(
    transaction: import('postgres').TransactionSql,
    order: OrderRow,
    status: TerminalStatus,
  ) {
    const [redeem] = await transaction<{ id: string; amount: string }[]>`
      SELECT id, amount FROM point_transactions
      WHERE source_reward_order_id = ${order.id} AND type = 'REDEEM'
    `;
    if (!redeem) throw new Error('Reward order has no REDEEM transaction');
    const amount = Math.abs(Number(redeem.amount));
    const [refund] = await transaction<{ id: string }[]>`
      INSERT INTO point_transactions (
        user_id, type, amount, source_reward_order_id, related_transaction_id,
        idempotency_key, affects_wallet, affects_point, affects_season, description, event_at
      ) VALUES (
        ${order.user_id}, 'REFUND', ${amount}, ${order.id}, ${redeem.id},
        ${`refund:${order.id}`}, true, false, false,
        ${`Hoàn điểm do đơn ${status.toLowerCase()}`}, now()
      ) ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (!refund) return;
    await transaction`
      INSERT INTO user_wallets (user_id, balance) VALUES (${order.user_id}, ${amount})
      ON CONFLICT (user_id) DO UPDATE
      SET balance = user_wallets.balance + ${amount}, updated_at = now()
    `;
    await transaction`
      UPDATE rewards SET stock = stock + 1, updated_at = now()
      WHERE id = ${order.reward_id} AND stock IS NOT NULL
    `;
  }
}
