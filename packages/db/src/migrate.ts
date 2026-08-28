import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabaseConnection } from './client';

/** Aplica las migraciones pendientes y termina. Idempotente. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL.');
  }

  const connection = createDatabaseConnection({ url, maxConnections: 1 });

  try {
    console.log('Aplicando migraciones...');
    await migrate(connection.db, { migrationsFolder: `${__dirname}/../migrations` });
    console.log('Migraciones aplicadas.');
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la migración:', error);
  process.exit(1);
});
