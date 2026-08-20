import type { Request } from 'express';

export const SESSION_COOKIE = 'cc_session';
export const CSRF_COOKIE = 'cc_csrf';

export interface AuthUser {
  sessionId: string;
  userId: string;
  displayName: string;
  systemRole: 'USER' | 'ADMIN' | 'SYSTEM_ADMIN';
  csrfTokenHash: string;
  mustChangePassword?: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthUser;
}
