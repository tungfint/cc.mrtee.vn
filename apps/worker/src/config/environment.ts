import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_DB_POOL_MAX: z.coerce.number().int().positive().max(20).default(3),
});

export type WorkerEnvironment = z.infer<typeof environmentSchema>;

export function parseWorkerEnvironment(source: NodeJS.ProcessEnv): WorkerEnvironment {
  return environmentSchema.parse(source);
}

@Injectable()
export class EnvironmentService {
  readonly values = parseWorkerEnvironment(process.env);
}
