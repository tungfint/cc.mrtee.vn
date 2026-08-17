import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_DB_POOL_MAX: z.coerce.number().int().positive().max(20).default(5),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function parseApiEnvironment(source: NodeJS.ProcessEnv): ApiEnvironment {
  return environmentSchema.parse(source);
}

@Injectable()
export class EnvironmentService {
  readonly values = parseApiEnvironment(process.env);
}
