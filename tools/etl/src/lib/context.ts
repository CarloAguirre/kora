import { createDatabaseConnection, type Database } from '@kora/db';
import postgres from 'postgres';
import { PostgresLegacyReader, type LegacyReader } from './legacy-reader';

/**
 * Contexto de una ejecución del ETL.
 *
 * Mantiene abiertas las dos conexiones —origen y destino— y el registro de lo
 * ocurrido. Todos los pasos reciben este objeto, lo que hace que ninguno
 * necesite saber de dónde salen las credenciales ni cómo se reporta.
 */

export interface EtlContext {
  /**
   * Conexión de solo lectura a la base de la v1, usada directamente por
   * `migrate-users.ts`/`migrate-teams.ts`/`migrate-team-members.ts` (dependen
   * de `auth.users`/`public.profiles`, fuera de lo que sirve `legacyReader`) y
   * por todos los `verify*.ts`. El importador por archivo no migra esas
   * entidades ni verifica nada, así que arma este campo con un valor que nunca
   * se invoca en ese camino, en vez de propagar `| undefined` a todo el resto
   * del código CLI que ya asume que siempre está presente.
   */
  readonly legacy: postgres.Sql;
  /**
   * Lector de tablas legacy completas, usado por los pasos de catálogos,
   * clientes, proyectos, horas, tickets y forecast — ver `lib/legacy-reader.ts`.
   * Por CLI sirve desde Postgres; desde el importador por archivo, desde un
   * dump JSON ya parseado.
   */
  readonly legacyReader: LegacyReader;
  /** Conexión de escritura a la base de la v2. */
  readonly target: Database;
  /**
   * Indica que la ejecución es un ensayo.
   *
   * Los pasos NO cambian de comportamiento por esto: escriben igual. El ensayo
   * se consigue envolviendo todo en una transacción que se revierte al final
   * (ver `runMigration`). Así el informe de un ensayo es idéntico al de una
   * ejecución real —cada paso ve lo que escribieron los anteriores— en lugar
   * de llenarse de falsos avisos por referencias que "no existen" solo porque
   * el paso previo no escribió nada.
   */
  readonly dryRun: boolean;
  readonly report: EtlReport;
  close(): Promise<void>;
}

/** Señal interna para revertir la transacción de un ensayo. */
export class DryRunRollback extends Error {
  constructor() {
    super('Ensayo completado: se revierte la transacción.');
    this.name = 'DryRunRollback';
  }
}

/**
 * Ejecuta la migración dentro de una única transacción.
 *
 * Dos garantías por el mismo mecanismo: en un ensayo, nada persiste; en una
 * ejecución real, o se migra todo o no se migra nada. No existe el estado
 * intermedio de "la mitad de los usuarios migrados", que es justo el escenario
 * que obligó a la v1 a inventar una tabla de reconciliación.
 */
export async function runMigration(
  context: EtlContext,
  work: (transactional: EtlContext) => Promise<void>,
): Promise<void> {
  try {
    await context.target.transaction(async (tx) => {
      await work({ ...context, target: tx as unknown as Database });
      if (context.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return;
    throw error;
  }
}

export interface StepResult {
  readonly step: string;
  readonly read: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  /** Filas borradas por poda (ver `lib/prune.ts`) — 0 en los pasos que solo hacen upsert. */
  readonly deleted: number;
  readonly warnings: string[];
}

export class EtlReport {
  private readonly steps: StepResult[] = [];
  private readonly startedAt = new Date();

  add(result: StepResult): void {
    this.steps.push(result);
    const line = [
      `  ${result.step.padEnd(24)}`,
      `leídos: ${String(result.read).padStart(5)}`,
      `creados: ${String(result.created).padStart(5)}`,
      `actualizados: ${String(result.updated).padStart(5)}`,
      `omitidos: ${String(result.skipped).padStart(5)}`,
      `eliminados: ${String(result.deleted).padStart(5)}`,
    ].join(' | ');
    console.log(line);

    for (const warning of result.warnings) {
      console.warn(`      aviso: ${warning}`);
    }
  }

  get totalWarnings(): number {
    return this.steps.reduce((sum, step) => sum + step.warnings.length, 0);
  }

  summary(): { durationMs: number; steps: StepResult[]; warnings: number } {
    return {
      durationMs: Date.now() - this.startedAt.getTime(),
      steps: this.steps,
      warnings: this.totalWarnings,
    };
  }
}

export async function createEtlContext(): Promise<EtlContext> {
  const legacyUrl = requireEnv('LEGACY_DATABASE_URL');
  const targetUrl = requireEnv('DATABASE_URL');

  if (legacyUrl === targetUrl) {
    throw new Error('LEGACY_DATABASE_URL y DATABASE_URL apuntan a la misma base. Aborta.');
  }

  const legacy = postgres(legacyUrl, { max: 2, onnotice: () => {} });
  const targetConnection = createDatabaseConnection({ url: targetUrl, maxConnections: 4 });
  const report = new EtlReport();

  return {
    legacy,
    legacyReader: new PostgresLegacyReader(legacy),
    target: targetConnection.db,
    dryRun: process.env.DRY_RUN === 'true',
    report,
    close: async () => {
      await legacy.end({ timeout: 5 });
      await targetConnection.close();
    },
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

/** Acumulador de resultados de un paso, para no repetir contadores en cada uno. */
export class StepTracker {
  read = 0;
  created = 0;
  updated = 0;
  skipped = 0;
  deleted = 0;
  readonly warnings: string[] = [];

  constructor(private readonly name: string) {}

  warn(message: string): void {
    this.warnings.push(message);
  }

  toResult(): StepResult {
    return {
      step: this.name,
      read: this.read,
      created: this.created,
      updated: this.updated,
      skipped: this.skipped,
      deleted: this.deleted,
      warnings: this.warnings,
    };
  }
}
