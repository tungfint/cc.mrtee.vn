import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AuthUser } from '../auth/auth.types';

export interface NotificationInput {
  title: string;
  body: string;
  audience: 'ALL' | 'USER' | 'ORGANIZATION';
  targetUserId?: string | undefined;
  targetOrganizationId?: string | undefined;
  tickerText?: string | undefined;
  tickerDurationMinutes: number;
  publishAt: Date;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async summary(userId: string) {
    const [[counts], ticker] = await Promise.all([
      this.database.sql<{ unread_count: number }[]>`
        SELECT count(*) FILTER (WHERE recipients.read_at IS NULL)::int AS unread_count
        FROM notification_recipients AS recipients
        JOIN notifications ON notifications.id = recipients.notification_id
        WHERE recipients.user_id = ${userId} AND notifications.active = true
          AND notifications.publish_at <= now()
      `,
      this.database.sql`
        SELECT notifications.id, notifications.ticker_text, notifications.publish_at
        FROM notification_recipients AS recipients
        JOIN notifications ON notifications.id = recipients.notification_id
        WHERE recipients.user_id = ${userId} AND notifications.active = true
          AND notifications.publish_at <= now()
          AND notifications.ticker_text IS NOT NULL
          AND notifications.ticker_duration_minutes > 0
          AND notifications.publish_at
            + notifications.ticker_duration_minutes * interval '1 minute' > now()
        ORDER BY notifications.publish_at DESC, notifications.created_at DESC
        LIMIT 5
      `,
    ]);
    return { unreadCount: counts?.unread_count ?? 0, ticker };
  }

  async list(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [notifications, [counts]] = await Promise.all([
      this.database.sql`
        SELECT notifications.id, notifications.title, notifications.body,
          notifications.audience, notifications.ticker_text, notifications.publish_at,
          notifications.created_at, recipients.read_at, creators.display_name AS created_by_name
        FROM notification_recipients AS recipients
        JOIN notifications ON notifications.id = recipients.notification_id
        LEFT JOIN users AS creators ON creators.id = notifications.created_by
        WHERE recipients.user_id = ${userId} AND notifications.active = true
          AND notifications.publish_at <= now()
        ORDER BY notifications.publish_at DESC, notifications.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      this.database.sql<{ total: number; unread_count: number }[]>`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE recipients.read_at IS NULL)::int AS unread_count
        FROM notification_recipients AS recipients
        JOIN notifications ON notifications.id = recipients.notification_id
        WHERE recipients.user_id = ${userId} AND notifications.active = true
          AND notifications.publish_at <= now()
      `,
    ]);
    return {
      notifications,
      page,
      pageSize,
      total: counts?.total ?? 0,
      unreadCount: counts?.unread_count ?? 0,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const [recipient] = await this.database.sql`
      UPDATE notification_recipients SET read_at = COALESCE(read_at, now())
      WHERE user_id = ${userId} AND notification_id = ${notificationId}
      RETURNING notification_id, read_at
    `;
    if (!recipient) throw new BadRequestException('Không tìm thấy thông báo');
    return { success: true, recipient };
  }

  async markAllRead(userId: string) {
    const recipients = await this.database.sql`
      UPDATE notification_recipients AS recipients SET read_at = now()
      FROM notifications
      WHERE notifications.id = recipients.notification_id
        AND recipients.user_id = ${userId} AND recipients.read_at IS NULL
        AND notifications.active = true AND notifications.publish_at <= now()
      RETURNING recipients.notification_id
    `;
    return { success: true, updated: recipients.length };
  }

  async adminList() {
    const notifications = await this.database.sql`
      SELECT notifications.*,
        creators.display_name AS created_by_name,
        target_users.display_name AS target_user_name,
        organizations.name AS target_organization_name,
        count(recipients.user_id)::int AS recipient_count,
        count(recipients.read_at)::int AS read_count
      FROM notifications
      LEFT JOIN users AS creators ON creators.id = notifications.created_by
      LEFT JOIN users AS target_users ON target_users.id = notifications.target_user_id
      LEFT JOIN organizations ON organizations.id = notifications.target_organization_id
      LEFT JOIN notification_recipients AS recipients
        ON recipients.notification_id = notifications.id
      GROUP BY notifications.id, creators.display_name, target_users.display_name,
        organizations.name
      ORDER BY notifications.created_at DESC
      LIMIT 200
    `;
    return { notifications };
  }

  async create(input: NotificationInput, actor: AuthUser) {
    return this.database.sql.begin(async (transaction) => {
      await this.assertTarget(transaction, input);
      const [notification] = await transaction<{ id: string }[]>`
        INSERT INTO notifications (
          title, body, audience, target_user_id, target_organization_id,
          ticker_text, ticker_duration_minutes, publish_at, created_by
        ) VALUES (
          ${input.title}, ${input.body}, ${input.audience}, ${input.targetUserId ?? null},
          ${input.targetOrganizationId ?? null}, ${input.tickerText || null},
          ${input.tickerText ? input.tickerDurationMinutes : 0},
          ${input.publishAt.toISOString()}, ${actor.userId}
        ) RETURNING *
      `;
      if (!notification) throw new BadRequestException('Không thể tạo thông báo');
      await this.insertRecipients(transaction, notification.id, input);
      const [{ count } = { count: 0 }] = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count FROM notification_recipients
        WHERE notification_id = ${notification.id}
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
        VALUES (${actor.userId}, 'NOTIFICATION_CREATED', 'notification', ${notification.id},
          ${JSON.stringify({ ...input, publishAt: input.publishAt.toISOString(), recipients: count })}::jsonb,
          'Admin tạo và gửi thông báo')
      `;
      return { notification, recipientCount: count };
    });
  }

  async archive(id: string, actor: AuthUser) {
    const [notification] = await this.database.sql`
      UPDATE notifications SET active = false, updated_at = now()
      WHERE id = ${id} AND active = true RETURNING *
    `;
    if (!notification) throw new BadRequestException('Không tìm thấy thông báo đang hoạt động');
    await this.database.sql`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
      VALUES (${actor.userId}, 'NOTIFICATION_ARCHIVED', 'notification', ${id},
        ${JSON.stringify(notification)}::jsonb, ${JSON.stringify({ active: false })}::jsonb,
        'Admin dừng hiển thị thông báo')
    `;
    return { success: true };
  }

  private async assertTarget(
    transaction: import('postgres').TransactionSql,
    input: NotificationInput,
  ) {
    if (input.audience === 'USER') {
      if (!input.targetUserId) throw new BadRequestException('Chọn học sinh nhận thông báo');
      const [user] = await transaction`
        SELECT id FROM users WHERE id = ${input.targetUserId} AND status = 'ACTIVE'
      `;
      if (!user) throw new BadRequestException('Không tìm thấy tài khoản đang hoạt động');
    }
    if (input.audience === 'ORGANIZATION') {
      if (!input.targetOrganizationId) throw new BadRequestException('Chọn lớp nhận thông báo');
      const [organization] = await transaction`
        SELECT id FROM organizations
        WHERE id = ${input.targetOrganizationId} AND status = 'ACTIVE'
      `;
      if (!organization) throw new BadRequestException('Không tìm thấy lớp đang hoạt động');
    }
  }

  private async insertRecipients(
    transaction: import('postgres').TransactionSql,
    notificationId: string,
    input: NotificationInput,
  ) {
    if (input.audience === 'ALL') {
      await transaction`
        INSERT INTO notification_recipients (notification_id, user_id)
        SELECT ${notificationId}, id FROM users WHERE status = 'ACTIVE'
        ON CONFLICT DO NOTHING
      `;
      return;
    }
    if (input.audience === 'USER') {
      await transaction`
        INSERT INTO notification_recipients (notification_id, user_id)
        VALUES (${notificationId}, ${input.targetUserId!}) ON CONFLICT DO NOTHING
      `;
      return;
    }
    await transaction`
      INSERT INTO notification_recipients (notification_id, user_id)
      SELECT ${notificationId}, memberships.user_id
      FROM organization_memberships AS memberships
      JOIN users ON users.id = memberships.user_id
      WHERE memberships.organization_id = ${input.targetOrganizationId!}
        AND memberships.status = 'ACTIVE' AND users.status = 'ACTIVE'
      ON CONFLICT DO NOTHING
    `;
  }
}
