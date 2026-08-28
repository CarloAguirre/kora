import { createEtlContext, runMigration } from './lib/context';
import { migrateCatalogs } from './steps/migrate-catalogs';
import { migrateClients } from './steps/migrate-clients';

/**
 * Migración del módulo de Catálogos y Clientes (M1).
 *
 *   DRY_RUN=true pnpm etl:clients   # ensayo, revertido al final
 *   pnpm etl:clients                # ejecuta
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Migración de catálogos y clientes');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, async (tx) => {
      await migrateCatalogs(tx);
      await migrateClients(tx);
    });

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(
      `Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`,
    );

    console.log(
      context.dryRun
        ? '\nEnsayo revertido: la base de destino no cambió.'
        : '\nSiguiente paso: pnpm etl:verify-clients',
    );
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló la migración:', error);
  process.exit(1);
});
