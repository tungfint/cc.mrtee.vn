import { resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';
import { z } from 'zod';
import { hashPassword } from './password';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const input = z
  .object({
    DATABASE_URL: z.string().url(),
    BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12),
    BOOTSTRAP_ADMIN_NAME: z.string().min(2).default('System Administrator'),
  })
  .parse(process.env);

async function main(): Promise<void> {
  const connection = postgres(input.DATABASE_URL, { max: 1 });
  try {
    const passwordHash = await hashPassword(input.BOOTSTRAP_ADMIN_PASSWORD);
    const [created] = await connection<{ id: string }[]>`
      WITH new_user AS (
        INSERT INTO users (full_name, display_name, system_role)
        VALUES (${input.BOOTSTRAP_ADMIN_NAME}, ${input.BOOTSTRAP_ADMIN_NAME}, 'SYSTEM_ADMIN')
        RETURNING id
      )
      INSERT INTO user_credentials (user_id, email, password_hash)
      SELECT id, ${input.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()}, ${passwordHash} FROM new_user
      ON CONFLICT (email) DO NOTHING
      RETURNING user_id AS id
    `;
    process.stdout.write(
      created ? `Created administrator ${created.id}\n` : 'Administrator exists\n',
    );
  } finally {
    await connection.end({ timeout: 5 });
  }
}

void main();
