import { createEtlContext, runMigration } from './lib/context';
import { migrateForecast } from './steps/migrate-forecast';

/**
 * Migración de forecast (M6). Ver docs/DECISION-M6-FORECAST.md.
 *
 * Requiere equipos, miembros de equipo, clientes, proyectos y usuarios ya migrados.
 *
 *   DRY_RUN=true pnpm forecast
 *   pnpm forecast
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Migración de forecast');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, migrateForecast);

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(`Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`);
    console.log(context.dryRun ? '\nEnsayo revertido: la base de destino no cambió.' : '\nSiguiente paso: pnpm verify-forecast');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló la migración:', error);
  process.exit(1);
});
