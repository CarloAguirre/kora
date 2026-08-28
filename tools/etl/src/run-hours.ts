import { createEtlContext, runMigration } from './lib/context';
import { migrateHourEntries } from './steps/migrate-hours';

/**
 * Migración del registro de horas (M4).
 *
 * Requiere que usuarios y proyectos ya estén migrados: sin ellos, ningún
 * registro de horas puede resolver a quién pertenece o a qué proyecto se
 * imputa.
 *
 *   DRY_RUN=true pnpm hours
 *   pnpm hours
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Migración de registro de horas');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, migrateHourEntries);

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(`Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`);
    console.log(context.dryRun ? '\nEnsayo revertido: la base de destino no cambió.' : '\nSiguiente paso: pnpm verify-hours');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló la migración:', error);
  process.exit(1);
});
