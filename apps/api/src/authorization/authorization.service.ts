import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AuthUser } from '../auth/auth.types';

export type OrganizationVisibility = 'PUBLIC' | 'CLOSED' | 'PRIVATE';
export type MembershipRole = 'MEMBER' | 'TEACHER' | 'ORG_ADMIN';

export interface OrganizationAccess {
  id: string;
  visibility: OrganizationVisibility;
  membershipRole: MembershipRole | null;
}

@Injectable()
export class AuthorizationService {
  constructor(private readonly database: DatabaseService) {}

  async organizationAccess(organizationId: string, user?: AuthUser): Promise<OrganizationAccess> {
    const [organization] = await this.database.sql<
      { id: string; visibility: OrganizationVisibility }[]
    >`
      SELECT id, visibility
      FROM organizations
      WHERE id = ${organizationId} AND status = 'ACTIVE'
    `;
    if (!organization) throw new NotFoundException('Không tìm thấy tổ chức');

    let membershipRole: MembershipRole | null = null;
    if (user) {
      const [membership] = await this.database.sql<{ role: MembershipRole }[]>`
        SELECT role
        FROM organization_memberships
        WHERE organization_id = ${organizationId}
          AND user_id = ${user.userId}
          AND status = 'ACTIVE'
      `;
      membershipRole = membership?.role ?? null;
    }
    return { ...organization, membershipRole };
  }

  assertCanView(access: OrganizationAccess, user?: AuthUser): void {
    if (access.visibility === 'PUBLIC') return;
    if (!user) throw new ForbiddenException('Tổ chức này yêu cầu đăng nhập');
    if (user.systemRole === 'SYSTEM_ADMIN') return;
    if (access.visibility === 'CLOSED') return;
    if (!access.membershipRole) throw new ForbiddenException('Không thuộc tổ chức riêng tư này');
  }

  assertCanManage(access: OrganizationAccess, user: AuthUser): void {
    if (user.systemRole === 'SYSTEM_ADMIN' || access.membershipRole === 'ORG_ADMIN') return;
    throw new ForbiddenException('Chỉ quản trị viên tổ chức được thực hiện thao tác này');
  }

  assertCanTeach(access: OrganizationAccess, user: AuthUser): void {
    if (
      user.systemRole === 'SYSTEM_ADMIN' ||
      access.membershipRole === 'ORG_ADMIN' ||
      access.membershipRole === 'TEACHER'
    ) {
      return;
    }
    throw new ForbiddenException('Chỉ giáo viên hoặc quản trị viên được thực hiện thao tác này');
  }
}
