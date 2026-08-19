import { useQuery } from '@tanstack/react-query';

const configuredApiBase: unknown = import.meta.env.VITE_API_BASE_URL;
export const API_BASE = typeof configuredApiBase === 'string' ? configuredApiBase : '/api';

function cookie(name: string) {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
    const csrf = cookie('cc_csrf');
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : (payload?.message ?? `Yêu cầu thất bại (${response.status})`);
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export interface SessionUser {
  userId: string;
  displayName: string;
  systemRole: 'USER' | 'SYSTEM_ADMIN';
  mustChangePassword: boolean;
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return await api<{ user: SessionUser }>('/auth/session');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

export function formatNumber(value: string | number | null | undefined, digits = 0) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(
    Number(value ?? 0),
  );
}

export function formatVnd(value: string | number | null | undefined) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
