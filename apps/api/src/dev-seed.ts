import { CF_SYNC_QUEUE } from '@cc/core';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import postgres from 'postgres';
import { z } from 'zod';
import { hashPassword } from './auth/password';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The local reset command cannot run in production');
}

const input = z
  .object({
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),
    DEV_ADMIN_EMAIL: z.string().email().default('admin@mrtee.vn'),
    DEV_ADMIN_PASSWORD: z.string().min(12),
    DEV_ADMIN_NAME: z.string().trim().min(2).default('Quản trị viên'),
  })
  .parse({
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL || undefined,
    DEV_ADMIN_EMAIL: process.env.DEV_ADMIN_EMAIL,
    DEV_ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD ?? process.env.BOOTSTRAP_ADMIN_PASSWORD,
    DEV_ADMIN_NAME: process.env.DEV_ADMIN_NAME,
  });

async function main(): Promise<void> {
  const sql = postgres(input.DATABASE_URL, { max: 1 });
  try {
    const passwordHash = await hashPassword(input.DEV_ADMIN_PASSWORD);
    await sql.begin(async (transaction) => {
      await transaction`
        TRUNCATE users, organizations, rewards, cf_problems RESTART IDENTITY CASCADE
      `;
      const [administrator] = await transaction<{ id: string }[]>`
        INSERT INTO users (full_name, display_name, system_role)
        VALUES (${input.DEV_ADMIN_NAME}, ${input.DEV_ADMIN_NAME}, 'SYSTEM_ADMIN')
        RETURNING id
      `;
      if (!administrator) throw new Error('Could not create the local administrator');
      await transaction`
        INSERT INTO user_credentials (user_id, email, password_hash)
        VALUES (${administrator.id}, ${input.DEV_ADMIN_EMAIL.toLowerCase()}, ${passwordHash})
      `;
    });

    if (input.REDIS_URL) {
      const redis = new Redis(input.REDIS_URL, { maxRetriesPerRequest: null });
      const queue = new Queue(CF_SYNC_QUEUE, { connection: redis });
      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
        await redis.quit();
      }
    }

    process.stdout.write(`Local data reset; administrator: ${input.DEV_ADMIN_EMAIL}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
