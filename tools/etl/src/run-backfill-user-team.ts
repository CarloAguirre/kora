import { createEtlContext, runMigration } from './lib/context';
import { backfillUserTeamFromHours } from './steps/backfill-user-team-from-hours';

/**
 * Corrige `users.team_id` (y la membresía activa en `team_members`) de
 * personas cuyo equipo no coincide con quien realmente les aprueba las
 * horas. Ver el comentario del paso para el criterio exacto.
 *
 *   DRY_RUN=true pnpm --filter @kora/etl backfill-user-team
 *   pnpm --filter @kora/etl backfill-user-team
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Backfill de equipo de usuario desde horas aprobadas');
  console.log('─'.repeat(78));
  if (context.dryRun) console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');

  try {
    await runMigration(context, backfillUserTeamFromHours);

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
