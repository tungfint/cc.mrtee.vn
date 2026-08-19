import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { DatabaseService } from '../database/database.service';
import { hashToken } from './password';
import { SESSION_COOKIE } from './auth.types';

interface SessionRow {
  session_id: string;
  user_id: string;
  display_name: string;
  system_role: AuthUser['systemRole'];
  csrf_token_hash: string;
  must_change_password: boolean;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (!token) {
      if (optional) return true;
      throw new UnauthorizedException('Yêu cầu đăng nhập');
    }

    const [session] = await this.database.sql<SessionRow[]>`
      SELECT
        sessions.id AS session_id,
        sessions.user_id,
        sessions.csrf_token_hash,
        users.display_name,
        users.system_role,
        credentials.must_change_password
      FROM auth_sessions AS sessions
      JOIN users ON users.id = sessions.user_id
      JOIN user_credentials AS credentials ON credentials.user_id = users.id
      WHERE sessions.token_hash = ${hashToken(token)}
        AND sessions.revoked_at IS NULL
        AND sessions.expires_at > now()
        AND users.status = 'ACTIVE'
    `;
    if (!session) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    request.auth = {
      sessionId: session.session_id,
      userId: session.user_id,
      displayName: session.display_name,
      systemRole: session.system_role,
      csrfTokenHash: session.csrf_token_hash,
      mustChangePassword: session.must_change_password,
    };
    return true;
  }
}
