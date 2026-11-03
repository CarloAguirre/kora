import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildQuotationTaskTemplate, readQuotationTaskExcel } from './quotation-task-excel';

const types = ['Sin tipo', 'CRUD / mantenedor', 'Integración con API', 'UAT'].map((name, i) => ({
  id: 'type-' + i, name,
}));
const teams = [
  { id: '0777e456-fd76-445e-83f1-afc25061c103', name: 'Desarrollo' },
  { id: '0777e456-fd76-445e-83f1-afc25061c104', name: 'QA' },
];
function fileWithRows(rows: unknown[][]): File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Tareas');
  // SheetJS puede devolver ArrayBuffer (no Uint8Array) con type=array.
  const raw = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array;
  const bytes = new Uint8Array(raw);
  const contents = bytes.slice().buffer as ArrayBuffer;
  return {
    name: 'cotizacion.xlsx', size: bytes.byteLength,
    arrayBuffer: async () => contents,
  } as File;
}
const headers = ['Fase', 'Tarea', 'Equipo', 'Tipo (catálogo)', 'Horas'];

describe('Excel de tareas en cotización', () => {
  it('escribe dropdowns nativos Excel con rangos originados en catálogo BD', () => {
    const bytes = buildQuotationTaskTemplate('Portal', teams, types);
    const book = XLSX.read(bytes, { type: 'array' });
    expect(book.SheetNames).toEqual(['Tareas', 'Equipos Kora', 'Tipos catálogo']);
    const catalog = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets['Tipos catálogo']!, {header: 1});
    expect(catalog.some((row) => row[0] === 'Integración con API')).toBe(true);
    const cfb = XLSX.CFB.read(bytes, { type: 'buffer' });
    const entry = XLSX.CFB.find(cfb, 'xl/worksheets/sheet1.xml');
    const xml = new TextDecoder().decode(new Uint8Array(entry!.content!));
    expect(xml).toContain('sqref="C2:C201"');
    expect(xml).toContain('<formula1>EquiposKora</formula1>');
    expect(xml).toContain('sqref="D2:D201"');
    expect(xml).toContain('<formula1>TiposCotizacion</formula1>');
    expect(book.Workbook?.Names?.find((name) => name.Name === 'EquiposKora')?.Ref)
      .toContain("'Equipos Kora'!$A$2:$A$3");
  });

  it('lee filas reales de XLSX, resolviendo solo equipos activos y tipos del catálogo', async () => {
    const file = fileWithRows([
      headers, ['Portal', '', '', 'Sin tipo', ''],
      ['Portal', 'Backend', 'Desarrollo', 'Integración con API', 12.5],
      ['Portal', 'UAT', 'QA', 'UAT', 7],
    ]);
    const rows = await readQuotationTaskExcel(file, 'Portal', teams, types);
    expect(rows).toEqual([
      { name: 'Backend', teamId: teams[0]!.id, classification: 'Integración con API', hours: 12.5 },
      { name: 'UAT', teamId: teams[1]!.id, classification: 'UAT', hours: 7 },
    ]);
    expect(types.map((row) => row.name)).toContain('Integración con API');
  });
  it('rechaza equipo inventado y no genera una importación parcial', async () => {
    const file = fileWithRows([
      headers,
      ['Portal', 'Backend', 'Desarrollo', 'CRUD / mantenedor', 12],
      ['Portal', 'Tarea falsa', 'Equipo no creado', 'Sin tipo', 10],
    ]);
    await expect(readQuotationTaskExcel(file, 'Portal', teams, types))
      .rejects.toThrow(/equipo inexistente/);
  });
  it('rechaza fase distinta, horas cero o más de dos decimales', async () => {
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Otra fase', 'Backend', 'Desarrollo', 'Sin tipo', 3],
    ]), 'Portal', teams, types)).rejects.toThrow(/otra fase/);
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Portal', 'Backend', 'Desarrollo', 'Sin tipo', 0],
    ]), 'Portal', teams, types)).rejects.toThrow(/Horas/);
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Portal', 'Backend', 'Desarrollo', 'Sin tipo', 1.555],
    ]), 'Portal', teams, types)).rejects.toThrow(/Horas/);
  });
  it('rechaza cabeceras distintas a la plantilla y tipos fuera del catálogo', async () => {
    await expect(readQuotationTaskExcel(fileWithRows([
      ['Nombre', 'Equipo', 'HH'], ['Tarea', 'Desarrollo', 3],
    ]), 'Portal', teams, types)).rejects.toThrow(/plantilla/);
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Portal', 'Tarea', 'Desarrollo', 'Inventado', 3],
    ]), 'Portal', teams, types)).rejects.toThrow(/tipo fuera/);
  });
});
