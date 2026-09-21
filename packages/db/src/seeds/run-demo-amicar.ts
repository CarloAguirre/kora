import { createDatabaseConnection } from '../client';
import { seedAmicarOperaciones } from './demo-amicar-operaciones';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const connection = createDatabaseConnection({ url, maxConnections: 1 });
  try {
    const result = await seedAmicarOperaciones(connection.db);
    console.log('Proyecto "Operaciones logísticas" (Amicar) sembrado:', result);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la siembra del demo Amicar:', error);
  process.exit(1);
});
