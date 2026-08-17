import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_DB_POOL_MAX: z.coerce.number().int().positive().max(20).default(3),
  CF_API_BASE_URL: z.string().url().default('https://codeforces.com/api'),
  CF_REQUEST_INTERVAL_MS: z.coerce.number().int().positive().default(2200),
  CF_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  CF_REQUEST_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(4),
});

export type WorkerEnvironment = z.infer<typeof environmentSchema>;

export function parseWorkerEnvironment(source: NodeJS.ProcessEnv): WorkerEnvironment {
  return environmentSchema.parse(source);
}

@Injectable()
export class EnvironmentService {
  readonly values = parseWorkerEnvironment(process.env);
}
