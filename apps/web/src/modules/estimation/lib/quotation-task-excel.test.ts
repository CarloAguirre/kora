import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { QUOTATION_TASK_TYPES, readQuotationTaskExcel } from './quotation-task-excel';

const teams = [
  { id: '0777e456-fd76-445e-83f1-afc25061c103', name: 'Desarrollo' },
  { id: '0777e456-fd76-445e-83f1-afc25061c104', name: 'QA' },
];
function fileWithRows(rows: unknown[][]): File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Tareas');
  const contents = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
  return {
    name: 'cotizacion.xlsx', size: contents.byteLength,
    arrayBuffer: async () => contents.buffer,
  } as File;
}
const headers = ['Fase', 'Tarea', 'Equipo', 'Tipo (catálogo)', 'Horas'];

describe('Excel de tareas en cotización', () => {
  it('lee filas reales de XLSX, resolviendo solo equipos activos y tipos del catálogo', async () => {
    const file = fileWithRows([
      headers, ['Portal', '', '', 'Sin tipo', ''],
      ['Portal', 'Backend', 'Desarrollo', 'Integración con API', 12.5],
      ['Portal', 'UAT', 'QA', 'UAT', 7],
    ]);
    const rows = await readQuotationTaskExcel(file, 'Portal', teams);
    expect(rows).toEqual([
      { name: 'Backend', teamId: teams[0]!.id, classification: 'Integración con API', hours: 12.5 },
      { name: 'UAT', teamId: teams[1]!.id, classification: 'UAT', hours: 7 },
    ]);
    expect(QUOTATION_TASK_TYPES).toContain('Integración con API');
  });
  it('rechaza equipo inventado y no genera una importación parcial', async () => {
    const file = fileWithRows([
      headers,
      ['Portal', 'Backend', 'Desarrollo', 'CRUD / mantenedor', 12],
      ['Portal', 'Tarea falsa', 'Equipo no creado', 'Sin tipo', 10],
    ]);
    await expect(readQuotationTaskExcel(file, 'Portal', teams))
      .rejects.toThrow(/equipo inexistente/);
  });
  it('rechaza fase distinta, horas cero o más de dos decimales', async () => {
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Otra fase', 'Backend', 'Desarrollo', 'Sin tipo', 3],
    ]), 'Portal', teams)).rejects.toThrow(/otra fase/);
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Portal', 'Backend', 'Desarrollo', 'Sin tipo', 0],
    ]), 'Portal', teams)).rejects.toThrow(/Horas/);
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Portal', 'Backend', 'Desarrollo', 'Sin tipo', 1.555],
    ]), 'Portal', teams)).rejects.toThrow(/Horas/);
  });
  it('rechaza cabeceras distintas a la plantilla y tipos fuera del catálogo', async () => {
    await expect(readQuotationTaskExcel(fileWithRows([
      ['Nombre', 'Equipo', 'HH'], ['Tarea', 'Desarrollo', 3],
    ]), 'Portal', teams)).rejects.toThrow(/plantilla/);
    await expect(readQuotationTaskExcel(fileWithRows([
      headers, ['Portal', 'Tarea', 'Desarrollo', 'Inventado', 3],
    ]), 'Portal', teams)).rejects.toThrow(/tipo fuera/);
  });
});
