import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export interface DatabaseClient {
  connection: Sql;
  db: PostgresJsDatabase<typeof schema>;
  close: () => Promise<void>;
}

export function createDatabaseClient(connectionString: string, maxConnections = 5): DatabaseClient {
  const connection = postgres(connectionString, {
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return {
    connection,
    db: drizzle(connection, { schema }),
    close: async () => connection.end({ timeout: 5 }),
  };
}
