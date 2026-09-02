import { createEtlContext, runMigration } from './lib/context';
import { backfillProjectTeamMembersFromHours } from './steps/backfill-project-team-members-from-hours';

/**
 * Backfill de asignaciones faltantes en `project_team_members`, a partir de
 * `hour_entries` — ver el comentario del paso para el porqué.
 *
 * Requiere que proyectos, equipos y horas ya estén migrados.
 *
 *   DRY_RUN=true pnpm --filter @kora/etl backfill-project-team-members
 *   pnpm --filter @kora/etl backfill-project-team-members
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Backfill de asignaciones de proyecto desde horas cargadas');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, backfillProjectTeamMembersFromHours);

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(`Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`);
    console.log(context.dryRun ? '\nEnsayo revertido: la base de destino no cambió.' : '\nListo.');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló el backfill:', error);
  process.exit(1);
});
