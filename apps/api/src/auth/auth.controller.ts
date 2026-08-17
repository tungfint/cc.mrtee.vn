import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { EnvironmentService } from '../config/environment';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthUser } from './auth.types';
import { CSRF_COOKIE, SESSION_COOKIE } from './auth.types';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly environment: EnvironmentService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = loginSchema.parse(body);
    const result = await this.auth.login(input.email, input.password);
    const cookieBase = {
      secure: this.environment.values.AUTH_COOKIE_SECURE,
      sameSite: 'lax' as const,
      path: '/',
      expires: result.expiresAt,
    };
    response.cookie(SESSION_COOKIE, result.sessionToken, { ...cookieBase, httpOnly: true });
    response.cookie(CSRF_COOKIE, result.csrfToken, { ...cookieBase, httpOnly: false });
    return { user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt };
  }

  @Get('session')
  session(@CurrentUser() user: AuthUser) {
    return { user: this.publicUser(user) };
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.auth.revokeSession(user.sessionId);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.clearCookie(CSRF_COOKIE, { path: '/' });
    return { success: true };
  }

  private publicUser(user: AuthUser) {
    return {
      userId: user.userId,
      displayName: user.displayName,
      systemRole: user.systemRole,
    };
  }
}
