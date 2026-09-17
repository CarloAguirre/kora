import { createDatabaseConnection } from '../client';
import { seedDemoClientPortal } from './demo-client-portal';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const connection = createDatabaseConnection({ url, maxConnections: 1 });
  try {
    const result = await seedDemoClientPortal(connection.db);
    console.log('Proyecto demo del portal de cliente sembrado:', result);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la siembra del demo:', error);
  process.exit(1);
});
