import { createDatabaseConnection } from '../client';
import { seedAccessCatalog } from './access-catalog';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const connection = createDatabaseConnection({ url, maxConnections: 1 });
  try {
    const result = await seedAccessCatalog(connection.db);
    console.log('Catálogo de acceso sembrado:', result);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la siembra:', error);
  process.exit(1);
});
