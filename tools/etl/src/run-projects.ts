import { createEtlContext, runMigration } from './lib/context';
import { migrateProjects } from './steps/migrate-projects';

/**
 * Migración del módulo de proyectos (M3).
 *
 * Requiere que M1 (clientes) y el módulo de equipos ya estén migrados: sin
 * clientes ni equipos, la mayoría de los proyectos quedarían sin poder
 * resolver sus referencias.
 *
 *   DRY_RUN=true pnpm etl:projects
 *   pnpm etl:projects
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Migración de proyectos');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, migrateProjects);

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(`Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`);
    console.log(context.dryRun ? '\nEnsayo revertido: la base de destino no cambió.' : '\nSiguiente paso: pnpm etl:verify-projects');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló la migración:', error);
  process.exit(1);
});
