import { parse } from 'csv-parse/sync';

/**
 * Parsea el archivo que hoy exporta el usuario con una consulta SQL propia
 * (`jsonb_build_object` con una clave por tabla legacy, coalescida a `[]`):
 * un CSV de una fila con una columna `dump` que contiene el JSON completo.
 *
 * No es un `.xlsx` real a propósito: una celda de Excel tiene un límite duro
 * de 32.767 caracteres, muy por debajo de los ~8 millones de caracteres que
 * pesa un dump real — ver la decisión en `docs/` del módulo admin.
 *
 * También se acepta un `.json` suelto (sin envoltorio CSV), con la forma que
 * produce el backup completo de la base legacy: `{ tables: { <tabla>: { rows:
 * [...] } } }` (además de `rowCount` y metadatos como `generatedAt`, que se
 * ignoran). `parseLegacyDumpFile` decide el formato mirando el contenido, no
 * la extensión, así que sirve sin importar qué nombre le puso quien exportó.
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

/**
 * Tablas que ningún paso de migración pide directamente, pero que
 * `@kora/etl` sí puede leer del dump ya parseado (vía `legacyReader.getRows`)
 * para resolver casos borde — hoy solo `usuario`, que alimenta el fallback
 * por correo de `lib/user-lookup.ts` cuando el UUID de Supabase de alguien
 * cambió entre el último `migrate-users` y este archivo. Nunca son un error
 * si faltan: simplemente ese fallback no tiene con qué trabajar.
 */
const OPTIONAL_PASSTHROUGH_TABLES = ['usuario'] as const;

export interface LegacyDumpParseResult {
  readonly dump: Record<string, unknown[]> | null;
  readonly errors: string[];
}

function copyOptionalPassthroughTables(source: Record<string, unknown>, target: Record<string, unknown[]>): void {
  for (const table of OPTIONAL_PASSTHROUGH_TABLES) {
    const entry = source[table];
    const rows = Array.isArray(entry)
      ? entry
      : typeof entry === 'object' && entry !== null && Array.isArray((entry as { rows?: unknown }).rows)
        ? (entry as { rows: unknown[] }).rows
        : null;
    if (rows) target[table] = rows;
  }
}

/**
 * Punto de entrada del importador por archivo: acepta tanto el CSV con
 * columna `dump` como un `.json` suelto, decidiendo por el contenido (el
 * primer carácter no vacío) en vez de por la extensión del archivo.
 */
export function parseLegacyDumpFile(buffer: Buffer): LegacyDumpParseResult {
  const sniffLength = Math.min(buffer.length, 256);
  const sniff = buffer.toString('utf-8', 0, sniffLength).trimStart();
  if (sniff.startsWith('{')) {
    return parseLegacyDumpJson(buffer);
  }
  return parseLegacyDumpCsv(buffer);
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
  copyOptionalPassthroughTables(dump, result);
  return { dump: result, errors: [] };
}

/**
 * Tablas requeridas cuya ausencia total en el `.json` NO es un error: son
 * exactamente las que `pruneStaleLegacyRows` (`@kora/etl`, `lib/prune.ts`) NO
 * poda —catálogos casi estáticos, más las dos tablas que ya hacen
 * *delete-all-and-reinsert* dentro de `migrate-projects.ts`—, así que tratar
 * su ausencia como "sin filas" no puede gatillar un borrado masivo.
 *
 * Las demás `REQUIRED_TABLES` si faltan siguen siendo un error duro (igual
 * que en el CSV): son justo las que si el archivo las omite, `pruneOne`
 * seguiría de largo y borraría todas las filas ya migradas de esa entidad,
 * confundiendo "esta tabla no venía en el archivo" con "esta tabla está
 * legítimamente vacía en origen".
 */
const TABLES_OPTIONAL_IN_JSON = new Set<(typeof REQUIRED_TABLES)[number]>([
  'pais',
  'comuna',
  'giro',
  'rubro',
  'responsable_comercial',
  'tipo_proyecto',
  'proyecto_participacion_historial',
  'proyecto_observacion',
]);

/**
 * Parsea el backup completo de la base legacy como `.json` suelto.
 *
 * Acepta dos formas para la raíz del archivo:
 * - `{ tables: { <tabla>: { rowCount, rows: [...] } } }` — la que produce hoy
 *   el backup completo (con metadatos `generatedAt`/`generatedBy` al nivel
 *   superior, que se ignoran).
 * - `{ <tabla>: [...] }` — la misma forma plana que ya acepta la columna
 *   `dump` del CSV, por si alguna exportación futura la sirve así de una.
 *
 * A diferencia del CSV, una tabla de `TABLES_OPTIONAL_IN_JSON` ausente no es
 * un error: el backup completo lista hasta las tablas vacías con
 * `rowCount: 0`, así que una de esas tablas que ni siquiera aparece lo más
 * probable es que no exista en el origen (p. ej. ya no se usa). El resto de
 * `REQUIRED_TABLES` sigue exigiendo la clave presente, igual que el CSV —ver
 * el comentario de `TABLES_OPTIONAL_IN_JSON`. Y en cualquier caso se rechaza
 * cuando el valor SÍ está presente pero no es una lista de filas, porque eso
 * delata un archivo con la forma equivocada.
 */
export function parseLegacyDumpJson(buffer: Buffer): LegacyDumpParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString('utf-8'));
  } catch (error) {
    return { dump: null, errors: [`el archivo no es JSON válido: ${(error as Error).message}`] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { dump: null, errors: ['el JSON debe ser un objeto (con las tablas en la raíz o bajo "tables")'] };
  }

  const root = parsed as Record<string, unknown>;
  const tablesField = root.tables;
  const rawTables =
    typeof tablesField === 'object' && tablesField !== null && !Array.isArray(tablesField)
      ? (tablesField as Record<string, unknown>)
      : root;

  const errors: string[] = [];
  const result: Record<string, unknown[]> = {};
  for (const table of REQUIRED_TABLES) {
    const entry = rawTables[table];
    if (entry === undefined) {
      if (!TABLES_OPTIONAL_IN_JSON.has(table)) {
        errors.push(`falta la tabla "${table}" en el dump`);
      }
      result[table] = [];
      continue;
    }

    const rows = Array.isArray(entry)
      ? entry
      : typeof entry === 'object' && entry !== null && Array.isArray((entry as { rows?: unknown }).rows)
        ? (entry as { rows: unknown[] }).rows
        : null;

    if (rows === null) {
      errors.push(`la tabla "${table}" no es una lista de filas ni un objeto con "rows"`);
      continue;
    }
    result[table] = rows;
  }

  if (errors.length > 0) return { dump: null, errors };
  copyOptionalPassthroughTables(rawTables, result);

  const dump = coerceDates(result) as Record<string, unknown[]>;
  return { dump, errors: [] };
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
