import { Injectable, Logger } from '@nestjs/common';
import type { CodeforcesApiResponse, CodeforcesSubmission } from '@cc/core';
import { EnvironmentService } from '../config/environment';
import { GlobalRateLimiter } from './global-rate-limiter';

export class CodeforcesClientError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class CodeforcesClient {
  private readonly logger = new Logger(CodeforcesClient.name);

  constructor(
    private readonly limiter: GlobalRateLimiter,
    private readonly environment: EnvironmentService,
  ) {}

  async userStatus(handle: string, from = 1, count = 100): Promise<CodeforcesSubmission[]> {
    return this.request<CodeforcesSubmission[]>('user.status', {
      handle,
      from: String(from),
      count: String(count),
    });
  }

  private async request<T>(method: string, parameters: Record<string, string>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.environment.values.CF_REQUEST_MAX_ATTEMPTS; attempt++) {
      await this.limiter.acquire();
      const url = new URL(`${this.environment.values.CF_API_BASE_URL}/${method}`);
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.environment.values.CF_REQUEST_TIMEOUT_MS),
          headers: { accept: 'application/json', 'user-agent': 'cc-mrtee-tracker/0.1' },
        });
        if (!response.ok) {
          throw new CodeforcesClientError(
            `Codeforces HTTP ${response.status}`,
            response.status === 429 || response.status >= 500,
            response.status,
          );
        }
        const payload = (await response.json()) as CodeforcesApiResponse<T>;
        if (payload.status !== 'OK' || payload.result === undefined) {
          const transient = payload.comment?.toLowerCase().includes('limit exceeded') ?? false;
          throw new CodeforcesClientError(
            payload.comment ?? 'Codeforces request failed',
            transient,
          );
        }
        return payload.result;
      } catch (error) {
        lastError = error;
        const transient =
          error instanceof CodeforcesClientError
            ? error.transient
            : error instanceof TypeError || error instanceof DOMException;
        if (!transient || attempt === this.environment.values.CF_REQUEST_MAX_ATTEMPTS) throw error;
        const backoff =
          Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        this.logger.warn(JSON.stringify({ event: 'cf_request_retry', method, attempt, backoff }));
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  }
}
