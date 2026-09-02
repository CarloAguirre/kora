import { describe, expect, it } from 'vitest';
import { parseLegacyDumpCsv, parseLegacyDumpFile, parseLegacyDumpJson } from './legacy-dump-parser';

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

function fullDump(overrides: Record<string, unknown[]> = {}): Record<string, unknown[]> {
  const dump: Record<string, unknown[]> = {};
  for (const table of REQUIRED_TABLES) dump[table] = overrides[table] ?? [];
  return dump;
}

describe('parseLegacyDumpJson', () => {
  it('lee el backup completo con el envoltorio "tables" (rowCount + rows)', () => {
    const backup = {
      generatedAt: '2026-09-01T23:03:42.640Z',
      generatedBy: 'rodrigo@kabeli.cl',
      tables: Object.fromEntries(
        Object.entries(fullDump({ cliente: [{ id_cliente: 1, nombre: 'Acme' }] })).map(([table, rows]) => [
          table,
          { rowCount: rows.length, rows },
        ]),
      ),
    };

    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify(backup)));

    expect(result.errors).toEqual([]);
    expect(result.dump?.cliente).toEqual([{ id_cliente: 1, nombre: 'Acme' }]);
  });

  it('también acepta la forma plana { tabla: [...] } sin envoltorio "tables"', () => {
    const dump = fullDump({ pais: [{ id_pais: 1, nombre: 'Chile' }] });

    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify(dump)));

    expect(result.errors).toEqual([]);
    expect(result.dump?.pais).toEqual([{ id_pais: 1, nombre: 'Chile' }]);
  });

  it('trata una tabla catálogo ausente como vacía en vez de fallar (a diferencia del CSV)', () => {
    const backup = { tables: {} as Record<string, unknown> };
    for (const table of REQUIRED_TABLES) {
      if (table === 'proyecto_observacion') continue;
      backup.tables[table] = { rowCount: 0, rows: [] };
    }

    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify(backup)));

    expect(result.errors).toEqual([]);
    expect(result.dump?.proyecto_observacion).toEqual([]);
  });

  it('sigue exigiendo una tabla que sí se poda (p.ej. "cliente"), aunque sea .json', () => {
    // A diferencia de "proyecto_observacion" (nunca se poda), si "cliente"
    // falta del archivo y se tratara como vacía, la poda borraría TODOS los
    // clientes ya migrados — ver TABLES_OPTIONAL_IN_JSON. Debe fallar antes.
    const backup = { tables: {} as Record<string, unknown> };
    for (const table of REQUIRED_TABLES) {
      if (table === 'cliente') continue;
      backup.tables[table] = { rowCount: 0, rows: [] };
    }

    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify(backup)));

    expect(result.dump).toBeNull();
    expect(result.errors).toEqual(['falta la tabla "cliente" en el dump']);
  });

  it('convierte strings de fecha ISO a Date, igual que el importador CSV', () => {
    const backup = { tables: {} as Record<string, unknown> };
    backup.tables.registro_hh = { rowCount: 1, rows: [{ id: 1, fecha: '2026-01-15T10:00:00.000Z' }] };
    for (const table of REQUIRED_TABLES) {
      if (table === 'registro_hh') continue;
      backup.tables[table] = { rowCount: 0, rows: [] };
    }

    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify(backup)));

    const fecha = (result.dump?.registro_hh?.[0] as { fecha: unknown }).fecha;
    expect(fecha).toBeInstanceOf(Date);
  });

  it('rechaza cuando una tabla presente no es una lista de filas ni {rows: [...]}', () => {
    const backup = { tables: { cliente: { rowCount: 1, rows: 'no-es-una-lista' } } };

    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify(backup)));

    expect(result.dump).toBeNull();
    expect(result.errors[0]).toMatch(/cliente/);
  });

  it('rechaza JSON inválido', () => {
    const result = parseLegacyDumpJson(Buffer.from('{ esto no es json'));

    expect(result.dump).toBeNull();
    expect(result.errors[0]).toMatch(/JSON válido/);
  });

  it('rechaza un JSON cuya raíz es un arreglo', () => {
    const result = parseLegacyDumpJson(Buffer.from(JSON.stringify([1, 2, 3])));

    expect(result.dump).toBeNull();
  });
});

describe('parseLegacyDumpFile', () => {
  it('detecta un .json por contenido y lo parsea como backup completo', () => {
    const dump = fullDump({ giro: [{ id_giro: 5 }] });

    const result = parseLegacyDumpFile(Buffer.from(JSON.stringify(dump)));

    expect(result.dump?.giro).toEqual([{ id_giro: 5 }]);
  });

  it('sigue aceptando el CSV con columna "dump" cuando el contenido no empieza con "{"', () => {
    const dump = fullDump({ rubro: [{ id_rubro: 2 }] });
    const csv = `dump\n"${JSON.stringify(dump).replace(/"/g, '""')}"\n`;

    const result = parseLegacyDumpFile(Buffer.from(csv));

    expect(result.dump?.rubro).toEqual([{ id_rubro: 2 }]);
  });

  it('sigue exigiendo todas las tablas en el CSV (a diferencia del .json)', () => {
    const csv = 'dump\n"{}"\n';

    const result = parseLegacyDumpCsv(Buffer.from(csv));

    expect(result.dump).toBeNull();
    expect(result.errors.length).toBe(REQUIRED_TABLES.length);
  });
});
