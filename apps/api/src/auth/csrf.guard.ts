import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorators';
import type { AuthenticatedRequest } from './auth.types';
import { hashToken } from './password';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;

    const csrfToken = request.header('x-csrf-token');
    if (!request.auth || !csrfToken || hashToken(csrfToken) !== request.auth.csrfTokenHash) {
      throw new ForbiddenException('CSRF token không hợp lệ');
    }
    return true;
  }
}
