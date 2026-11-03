import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildQuotationTaskTemplate, readQuotationTaskExcel } from './quotation-task-excel';

const teams = [
  { id: '0777e456-fd76-445e-83f1-afc25061c103', name: 'Desarrollo' },
  { id: '0777e456-fd76-445e-83f1-afc25061c104', name: 'QA' },
];
const headers = ['Fase', 'Tarea', 'Equipo', 'Horas'];
function excel(rows: unknown[][]): File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Tareas');
  const bytes = new Uint8Array(XLSX.write(book, { bookType:'xlsx', type:'array' }));
  return {
    name: 'cotizacion.xlsx', size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  } as File;
}
describe('Tareas de cotización: Excel sin categoría innecesaria', () => {
  it('exporta solo cuatro columnas y dropdown de equipo basado en Kora', () => {
    const bytes = buildQuotationTaskTemplate('Portal', teams);
    const book = XLSX.read(bytes, {type:'array'});
    expect(book.SheetNames).toEqual(['Tareas','Equipos Kora']);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Tareas!, {header:1});
    expect(rows[0]).toEqual(headers);
    const cfb = XLSX.CFB.read(bytes, {type:'buffer'});
    const index = cfb.FullPaths.findIndex((p: string) =>
      p.toLowerCase().endsWith('/xl/worksheets/sheet1.xml'));
    expect(index).toBeGreaterThanOrEqual(0);
    const xml = new TextDecoder().decode(new Uint8Array(cfb.FileIndex[index]!.content!));
    expect(xml).toContain('sqref="C2:C201"');
    expect(xml).toContain('<formula1>EquiposKora</formula1>');
  });
  it('importa tareas sin columna ni tipo', async () => {
    const rows = await readQuotationTaskExcel(excel([
      headers, ['Portal','','',''],
      ['Portal','Backend','Desarrollo',12.5],
      ['Portal','Casos QA','QA',7],
    ]), 'Portal', teams);
    expect(rows).toEqual([
      {name:'Backend',teamId:teams[0]!.id,hours:12.5},
      {name:'Casos QA',teamId:teams[1]!.id,hours:7},
    ]);
  });
  it('rechaza fases distintas, equipos inexistentes y horas inválidas', async () => {
    await expect(readQuotationTaskExcel(excel([
      headers,['Otra fase','Backend','Desarrollo',2],
    ]),'Portal',teams)).rejects.toThrow(/otra fase/);
    await expect(readQuotationTaskExcel(excel([
      headers,['Portal','Backend','Inexistente',2],
    ]),'Portal',teams)).rejects.toThrow(/equipo Kora/);
    await expect(readQuotationTaskExcel(excel([
      headers,['Portal','Backend','Desarrollo',0],
    ]),'Portal',teams)).rejects.toThrow(/HH inválidas/);
  });
});
