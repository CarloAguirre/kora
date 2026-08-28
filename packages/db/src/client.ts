import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseSchema = typeof schema;

export interface DatabaseConfig {
  readonly url: string;
  /** Tamaño del pool. Uno solo en migraciones y scripts; varios en la API. */
  readonly maxConnections?: number;
  readonly ssl?: boolean;
  readonly debug?: boolean;
}

export interface DatabaseConnection {
  readonly db: Database;
  readonly sql: postgres.Sql;
  close(): Promise<void>;
}

/**
 * Crea la conexión. Es una función y no un singleton importable a propósito:
 * la API, los tests y el ETL necesitan configuraciones distintas, y un
 * singleton de módulo haría imposible aislar un test.
 */
export function createDatabaseConnection(config: DatabaseConfig): DatabaseConnection {
  const client = postgres(config.url, {
    max: config.maxConnections ?? 10,
    ssl: config.ssl ? 'require' : false,
    onnotice: () => {},
    transform: { undefined: null },
  });

  const db = drizzle(client, { schema, logger: config.debug ?? false });

  return {
    db,
    sql: client,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
