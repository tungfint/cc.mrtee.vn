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
  BACKFILL_PAGE_SIZE: z.coerce.number().int().positive().max(10_000).default(1000),
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(25),
  SYNC_ONLINE_TARGET_MINUTES: z.coerce.number().positive().default(15),
  SYNC_RECENT_TARGET_MINUTES: z.coerce.number().positive().default(30),
  SYNC_OFFLINE_TARGET_MINUTES: z.coerce.number().positive().default(1440),
  SYNC_CAPACITY_RESERVE_PERCENT: z.coerce.number().min(0.2).max(0.3).default(0.25),
});

export type WorkerEnvironment = z.infer<typeof environmentSchema>;

export function parseWorkerEnvironment(source: NodeJS.ProcessEnv): WorkerEnvironment {
  return environmentSchema.parse(source);
}

@Injectable()
export class EnvironmentService {
  readonly values = parseWorkerEnvironment(process.env);
}
