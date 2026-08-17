import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function migrateDatabase(
  connectionString: string,
  migrationsFolder = resolve(__dirname, '../drizzle'),
): Promise<void> {
  const connection = postgres(connectionString, { max: 1 });

  try {
    await migrate(drizzle(connection), { migrationsFolder });
  } finally {
    await connection.end({ timeout: 5 });
  }
}
