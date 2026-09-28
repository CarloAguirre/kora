import { createDatabaseConnection } from '../client';
import { seedDemoSupportBilling } from './demo-support-billing';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const connection = createDatabaseConnection({ url, maxConnections: 1 });
  try {
    const result = await seedDemoSupportBilling(connection.db);
    console.log('Contratos demo de Facturación de Soporte sembrados:', result);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la siembra del demo de Facturación de Soporte:', error);
  process.exit(1);
});
