import { createEtlContext, runMigration } from './lib/context';
import { migrateTeams } from './steps/migrate-teams';
import { migrateUsers } from './steps/migrate-users';
import { migrateTeamMembers } from './steps/migrate-team-members';

/**
 * Migración del módulo de usuario, de principio a fin.
 *
 * El orden no es negociable:
 *   1. equipos       — `users.team_id` los necesita existiendo.
 *   2. usuarios      — con credenciales e identidades heredadas.
 *   3. pertenencias  — y, de paso, el líder de cada equipo, que ya se puede resolver.
 *
 * Todo el proceso es idempotente: reejecutarlo actualiza en vez de duplicar. Se
 * puede ensayar contra una copia tantas veces como haga falta, comparar el
 * informe y solo entonces ejecutarlo de verdad.
 *
 *   DRY_RUN=true pnpm etl:users   # recorre y reporta, sin escribir
 *   pnpm etl:users                # ejecuta
 *   pnpm etl:verify               # comprueba que origen y destino cuadran
 */
async function main(): Promise<void> {
  const context = await createEtlContext();

  console.log('Migración del módulo de usuario');
  console.log('─'.repeat(78));
  if (context.dryRun) {
    console.log('MODO ENSAYO: no se escribirá nada en la base de destino.\n');
  }

  try {
    await runMigration(context, async (tx) => {
      await migrateTeams(tx);
      await migrateUsers(tx);
      await migrateTeamMembers(tx);
    });

    const summary = context.report.summary();
    console.log('─'.repeat(78));
    console.log(
      `Terminado en ${(summary.durationMs / 1000).toFixed(1)}s con ${summary.warnings} aviso(s).`,
    );

    if (summary.warnings > 0) {
      console.log('\nLos avisos NO son errores: son filas que requieren una decisión humana');
      console.log('(correos duplicados, referencias rotas en origen). Revísalos antes de');
      console.log('dar la migración por buena.');
    }

    if (context.dryRun) {
      console.log('\nEnsayo revertido: la base de destino no cambió.');
    } else {
      console.log('\nSiguiente paso: pnpm etl:verify');
    }
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalló la migración:', error);
  process.exit(1);
});
