import type postgres from 'postgres';

/**
 * Abstrae de dónde vienen las filas "legacy" que leen los pasos de migración.
 *
 * Todas las consultas que usan los pasos en `steps/{migrate-catalogs,
 * migrate-clients,migrate-projects,migrate-hours,migrate-tickets,
 * migrate-forecast}.ts` son `select * from public.<tabla>` (sin `where` ni
 * agregaciones) — la única excepción es el `left join proyecto/tipo_proyecto`
 * de `migrate-projects.ts`, resuelto en JS con un `Map`, igual que ya hace
 * `migrate-clients.ts` para el contacto principal. Esto hace que "toda tabla
 * legacy completa" sea la única operación que este puerto necesita exponer,
 * lo que permite servir las mismas filas desde un Postgres real (CLI) o desde
 * un dump JSON ya parseado (importador por archivo).
 */
export interface LegacyReader {
  getRows<T = Record<string, unknown>>(table: string): Promise<T[]>;
}

/** Tablas que los pasos en alcance del importador por archivo pueden pedir. */
const ALLOWED_TABLES = new Set([
  'pais',
  'comuna',
  'giro',
  'rubro',
  'cliente',
  'contacto_cliente',
  'responsable_comercial',
  'proyecto',
  'tipo_proyecto',
  'equipo_proyecto',
  'proyecto_colaborador',
  'proyecto_participacion_historial',
  'proyecto_observacion',
  'registro_hh',
  'feriado',
  'ticket',
  'ticket_history',
  'soporte_plan_contrato',
  'soporte_periodo_mensual',
  'forecast_asignacion',
  'forecast_asignacion_log',
]);

/** Implementación real: lee de la base legacy viva (uso actual por CLI, sin cambios de comportamiento). */
export class PostgresLegacyReader implements LegacyReader {
  constructor(private readonly sql: postgres.Sql) {}

  async getRows<T>(table: string): Promise<T[]> {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`PostgresLegacyReader: tabla no permitida "${table}"`);
    }
    const rows = await this.sql`select * from public.${this.sql(table)}`;
    return rows as unknown as T[];
  }
}

/**
 * Implementación para el importador por archivo: sirve filas desde un dump JSON ya parseado.
 *
 * Los pasos de migración esperan fechas como `Date` (llaman `.getTime()`,
 * `.toISOString()`, las pasan directo a columnas timestamp/date de Drizzle) —
 * exactamente lo que devuelve el driver de Postgres. `JSON.parse` en cambio
 * deja fechas como strings ISO. Por eso el dump que recibe este lector debe
 * llegar ya normalizado (strings ISO de fecha/hora convertidos a `Date`) —
 * ver `legacy-dump-parser.ts` en el módulo `admin` de `apps/api`, que hace esa
 * conversión antes de construir este lector.
 */
export class JsonLegacyReader implements LegacyReader {
  constructor(private readonly dump: Readonly<Record<string, unknown[]>>) {}

  async getRows<T>(table: string): Promise<T[]> {
    return ((this.dump[table] as T[] | undefined) ?? []).slice();
  }
}
