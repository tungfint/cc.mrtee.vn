import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
  }): Promise<void> {
    await this.database.sql`
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before,
        after,
        reason
      ) VALUES (
        ${input.actorUserId},
        ${input.action},
        ${input.entityType},
        ${input.entityId},
        ${JSON.stringify(input.before ?? null)}::jsonb,
        ${JSON.stringify(input.after ?? null)}::jsonb,
        ${input.reason ?? null}
      )
    `;
  }
}
