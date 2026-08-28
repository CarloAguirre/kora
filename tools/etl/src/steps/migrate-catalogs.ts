import { businessSectors, comunas, countries, eq, industries } from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Migra los catálogos de referencia: país, comuna, giro y rubro.
 *
 * Van primero porque `clients` los referencia. Son tablas pequeñas y estables
 * (11, 69, 28 y 18 filas), así que el paso es idéntico para las cuatro: leer,
 * y crear o actualizar por `legacy_id`.
 */

interface LegacyPaisRow {
  id_pais: number;
  descrip_pais: string;
}
interface LegacyComunaRow {
  id_comuna: number;
  descrip_comuna: string;
}
interface LegacyGiroRow {
  id_giro: number;
  descrip_giro: string;
}
interface LegacyRubroRow {
  id_rubro: number;
  descrip_rubro: string;
}
interface LegacyCatalogRow {
  id: number;
  name: string;
}

export async function migrateCatalogs(context: EtlContext): Promise<void> {
  const paises = await context.legacyReader.getRows<LegacyPaisRow>('pais');
  await migrateOne(
    context,
    'países',
    countries,
    paises.map((row) => ({ id: row.id_pais, name: row.descrip_pais })).sort((a, b) => a.id - b.id),
  );

  const comunasRows = await context.legacyReader.getRows<LegacyComunaRow>('comuna');
  await migrateOne(
    context,
    'comunas',
    comunas,
    comunasRows.map((row) => ({ id: row.id_comuna, name: row.descrip_comuna })).sort((a, b) => a.id - b.id),
  );

  const giros = await context.legacyReader.getRows<LegacyGiroRow>('giro');
  await migrateOne(
    context,
    'giros',
    industries,
    giros.map((row) => ({ id: row.id_giro, name: row.descrip_giro })).sort((a, b) => a.id - b.id),
  );

  const rubros = await context.legacyReader.getRows<LegacyRubroRow>('rubro');
  await migrateOne(
    context,
    'rubros',
    businessSectors,
    rubros.map((row) => ({ id: row.id_rubro, name: row.descrip_rubro })).sort((a, b) => a.id - b.id),
  );
}

async function migrateOne(
  context: EtlContext,
  label: string,
  table: typeof countries | typeof comunas | typeof industries | typeof businessSectors,
  rows: LegacyCatalogRow[],
): Promise<void> {
  const tracker = new StepTracker(label);
  tracker.read = rows.length;

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      tracker.warn(`${label} ${row.id} sin nombre; se omite`);
      tracker.skipped += 1;
      continue;
    }

    const existing = await context.target
      .select({ id: table.id })
      .from(table)
      .where(eq(table.legacyId, row.id))
      .limit(1);

    if (existing[0]) {
      await context.target.update(table).set({ name, updatedAt: new Date() }).where(eq(table.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(table).values({ legacyId: row.id, name });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}
