import { parse } from 'csv-parse/sync';

/**
 * Parsea el archivo que hoy exporta el usuario con una consulta SQL propia
 * (`jsonb_build_object` con una clave por tabla legacy, coalescida a `[]`):
 * un CSV de una fila con una columna `dump` que contiene el JSON completo.
 *
 * No es un `.xlsx` real a propósito: una celda de Excel tiene un límite duro
 * de 32.767 caracteres, muy por debajo de los ~8 millones de caracteres que
 * pesa un dump real — ver la decisión en `docs/` del módulo admin.
 */

/** Tablas que el pipeline en alcance (`@kora/etl`) necesita — ver `ALLOWED_TABLES` en `legacy-reader.ts`. */
const REQUIRED_TABLES = [
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
] as const;

export interface LegacyDumpParseResult {
  readonly dump: Record<string, unknown[]> | null;
  readonly errors: string[];
}

export function parseLegacyDumpCsv(buffer: Buffer): LegacyDumpParseResult {
  const errors: string[] = [];

  let records: Record<string, string>[];
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  } catch (error) {
    return { dump: null, errors: [`el archivo no es un CSV válido: ${(error as Error).message}`] };
  }

  const row = records[0];
  if (!row) {
    return { dump: null, errors: ['el archivo no tiene ninguna fila de datos'] };
  }

  const raw = row.dump;
  if (raw === undefined) {
    return { dump: null, errors: ['el archivo no tiene una columna "dump"'] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { dump: null, errors: [`la columna "dump" no contiene JSON válido: ${(error as Error).message}`] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { dump: null, errors: ['el JSON del dump debe ser un objeto con una clave por tabla'] };
  }

  const dump = coerceDates(parsed) as Record<string, unknown>;

  const result: Record<string, unknown[]> = {};
  for (const table of REQUIRED_TABLES) {
    const value = dump[table];
    if (value === undefined) {
      errors.push(`falta la tabla "${table}" en el dump`);
      continue;
    }
    if (!Array.isArray(value)) {
      errors.push(`la tabla "${table}" no es una lista de filas`);
      continue;
    }
    result[table] = value;
  }

  if (errors.length > 0) return { dump: null, errors };
  return { dump: result, errors: [] };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)?)?$/;

/**
 * `JSON.parse` deja toda fecha como string ISO. Los pasos de migración
 * esperan `Date` (igual que el driver de Postgres) — ver el comentario en
 * `JsonLegacyReader` en `@kora/etl`. Se convierte una sola vez acá, recorriendo
 * todo el dump.
 */
function coerceDates(value: unknown): unknown {
  if (typeof value === 'string') {
    return ISO_DATE_RE.test(value) ? new Date(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(coerceDates);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = coerceDates(val);
    }
    return result;
  }
  return value;
}
