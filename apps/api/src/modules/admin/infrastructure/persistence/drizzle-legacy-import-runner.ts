import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@kora/db';
import {
  EtlReport,
  JsonLegacyReader,
  migrateCatalogs,
  migrateClients,
  migrateForecast,
  migrateHourEntries,
  migrateProjects,
  migrateTickets,
  pruneStaleLegacyRows,
  runMigration,
  type EtlContext,
} from '@kora/etl';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import type { LegacyImportRunInput, LegacyImportRunner, LegacyImportRunResult } from '../../application/ports/legacy-import-runner.port';

/**
 * Corre el pipeline de `@kora/etl` (catálogos → clientes → proyectos →
 * {horas, tickets, forecast} → poda) contra el dump ya parseado del archivo
 * subido, dentro de una única transacción — un ensayo (`dryRun`) la revierte
 * al final vía `runMigration`, así que la vista previa nunca escribe nada.
 */
@Injectable()
export class DrizzleLegacyImportRunner implements LegacyImportRunner {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run(input: LegacyImportRunInput): Promise<LegacyImportRunResult> {
    const report = new EtlReport();
    const context: EtlContext = {
      target: this.db,
      legacyReader: new JsonLegacyReader(input.dump),
      dryRun: input.dryRun,
      report,
      // `EtlContext.legacy` solo lo usan los pasos de usuarios/equipos, fuera
      // de alcance de este importador (ver el puerto) — nunca se invoca en
      // este camino, así que no vale la pena abrir una conexión Postgres real
      // solo para satisfacer el tipo.
      legacy: undefined as unknown as EtlContext['legacy'],
      // `DATABASE` es una conexión de vida larga que administra `DatabaseModule`
      // (ver su comentario sobre cierre en `onApplicationShutdown`) — este
      // runner no es dueño de su ciclo de vida, así que no la cierra.
      close: async () => {},
    };

    await runMigration(context, async (tx) => {
      await migrateCatalogs(tx);
      await migrateClients(tx);
      await migrateProjects(tx);
      await migrateHourEntries(tx);
      await migrateTickets(tx);
      await migrateForecast(tx);
      await pruneStaleLegacyRows(tx, input.dump);
    });

    const summary = report.summary();
    return {
      dryRun: input.dryRun,
      durationMs: summary.durationMs,
      steps: summary.steps,
      totalWarnings: summary.warnings,
    };
  }
}
