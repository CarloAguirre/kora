import { createDatabaseConnection } from '../client';
import { deleteControlesCriticosPreview, seedAureliaControlesCriticos } from './aurelia-controles-criticos';

const MODES = ['preview', 'real', 'cleanup'] as const;
type Mode = (typeof MODES)[number];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const mode = process.argv[2] as Mode | undefined;
  if (!mode || !MODES.includes(mode)) {
    throw new Error(`Indica el destino: ${MODES.join(' | ')} (p.ej. \`pnpm --filter @kora/db seed:aurelia-controles-criticos preview\`).`);
  }

  const connection = createDatabaseConnection({ url, maxConnections: 1 });
  try {
    if (mode === 'cleanup') {
      await connection.db.transaction((tx) => deleteControlesCriticosPreview(tx));
      console.log('Proyecto "AurelIA - Controles críticos carga" y sus horas copiadas, borrados.');
      return;
    }
    const result = await seedAureliaControlesCriticos(connection.db, mode);
    console.log(`Ficha de Controles críticos cargada en "${result.projectName}":`, result);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló la carga de AurelIA - Controles críticos:', error);
  process.exit(1);
});
