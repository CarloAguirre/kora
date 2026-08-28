import { createEtlContext, runMigration } from './lib/context';
import { migrateTickets } from './steps/migrate-tickets';

/**
 * Migración de tickets y planes de soporte (M5a). Ver docs/DECISION-M5-TICKETS.md.
 *
 * Requiere clientes, proyectos y usuarios ya migrados.
 *
 *   DRY_RUN=true pnpm tickets
 *   pnpm tickets
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Migración de tickets y planes de soporte');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, migrateTickets);

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(`Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`);
    console.log(context.dryRun ? '\nEnsayo revertido: la base de destino no cambió.' : '\nSiguiente paso: pnpm verify-tickets');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló la migración:', error);
  process.exit(1);
});
