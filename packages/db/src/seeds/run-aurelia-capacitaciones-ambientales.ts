import { createDatabaseConnection } from '../client';
import { deleteCapacitacionesAmbientalesPreview, seedAureliaCapacitacionesAmbientales } from './aurelia-capacitaciones-ambientales';

const MODES = ['preview', 'real', 'cleanup'] as const;
type Mode = (typeof MODES)[number];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const mode = process.argv[2] as Mode | undefined;
  if (!mode || !MODES.includes(mode)) {
    throw new Error(`Indica el destino: ${MODES.join(' | ')} (p.ej. \`pnpm --filter @kora/db seed:aurelia-capacitaciones-ambientales preview\`).`);
  }

  const connection = createDatabaseConnection({ url, maxConnections: 1 });
  try {
    if (mode === 'cleanup') {
      await connection.db.transaction((tx) => deleteCapacitacionesAmbientalesPreview(tx));
      console.log('Proyecto "AurelIA - Capacitaciones ambientales carga" y sus horas copiadas, borrados.');
      return;
    }
    const result = await seedAureliaCapacitacionesAmbientales(connection.db, mode);
    console.log(`Ficha de Capacitaciones ambientales cargada en "${result.projectName}":`, result);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la carga de AurelIA - Capacitaciones ambientales:', error);
  process.exit(1);
});
