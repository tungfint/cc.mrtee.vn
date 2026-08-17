import { migrateDatabase } from './migrate';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database migrations');
}

migrateDatabase(connectionString).catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
