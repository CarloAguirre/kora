import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseConnection } from '@kora/db';
import { DrizzleProjectHourEntryReader } from './drizzle-project-hour-entry-reader';

/**
 * Regresión real contra PostgreSQL. No hay conexión en los tests unitarios
 * comunes: el CI ejecuta este archivo explícitamente DESPUÉS de las migraciones.
 *
 * Tabla TEMPORAL con el mismo nombre que la real, aislada en su propia conexión.
 * No se insertan proyectos ni HH en tablas persistentes.
 */
const dbUrl = process.env.DATABASE_URL;
const describeWithPostgres = dbUrl ? describe : describe.skip;

describeWithPostgres('DrizzleProjectHourEntryReader — histórico mensual en PostgreSQL', () => {
  const projectId = '261027ee-2261-473c-92fb-077e6ceae64b';
  let connection: DatabaseConnection;
  let reader: DrizzleProjectHourEntryReader;

  beforeAll(async () => {
    connection = createDatabaseConnection({ url: dbUrl!, maxConnections: 1 });
    // El search_path de PostgreSQL prioriza tablas temporales sobre public.
    // Reproduce los tipos de las columnas usadas sin tocar hour_entries real.
    await connection.sql.unsafe(`
      create temporary table hour_entries (
        project_id uuid,
        "date" date not null,
        "hours" numeric(10, 2) not null,
        "status" text not null
      ) on commit preserve rows
    `);
    await connection.sql.unsafe(`
      insert into hour_entries (project_id, "date", "hours", "status") values
        ('261027ee-2261-473c-92fb-077e6ceae64b', '2026-03-29', 2.25, 'approved'),
        ('261027ee-2261-473c-92fb-077e6ceae64b', '2026-03-30', 3.50, 'approved'),
        ('261027ee-2261-473c-92fb-077e6ceae64b', '2026-04-04', 4.25, 'approved'),
        ('261027ee-2261-473c-92fb-077e6ceae64b', '2026-04-05', 8.00, 'pending'),
        ('261027ee-2261-473c-92fb-077e6ceae64b', '2026-04-06', 7.00, 'rejected')
    `);
    reader = new DrizzleProjectHourEntryReader(connection.db);
  });

  afterAll(async () => {
    if (connection) await connection.close();
  });

  it('agrupa por mes real y clasifica el mismo día del corte como ejecución', async () => {
    const result = await reader.approvedMonthlyHoursForProject(
      projectId, new Date('2026-03-30T00:00:00.000Z'),
    );
    expect(result).toEqual([
      { month: '2026-03', preactivationHours: 2.25, executionHours: 3.5 },
      { month: '2026-04', preactivationHours: 0, executionHours: 4.25 },
    ]);
  });

  it('cambiar el corte redistribuye HH sin modificar su fecha ni cantidad', async () => {
    const result = await reader.approvedMonthlyHoursForProject(
      projectId, new Date('2026-04-01T00:00:00.000Z'),
    );
    expect(result).toEqual([
      { month: '2026-03', preactivationHours: 5.75, executionHours: 0 },
      { month: '2026-04', preactivationHours: 0, executionHours: 4.25 },
    ]);
  });

  it('sin corte conserva las HH aprobadas en preactivación', async () => {
    const result = await reader.approvedMonthlyHoursForProject(projectId, null);
    expect(result).toEqual([
      { month: '2026-03', preactivationHours: 5.75, executionHours: 0 },
      { month: '2026-04', preactivationHours: 4.25, executionHours: 0 },
    ]);
  });
});
