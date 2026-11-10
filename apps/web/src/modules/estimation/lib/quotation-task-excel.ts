import * as XLSX from 'xlsx';

export type QuotationTaskExcelTeam = { id: string; name: string };
export type ImportedQuotationTask = { name: string; teamId: string; hours: number };
const HEADERS = ['Fase', 'Tarea', 'Equipo', 'Horas'];
const norm = (s: string) => s.toLocaleLowerCase('es-CL').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim();
const str = (v: unknown) => typeof v === 'string' ? v.trim() :
  typeof v === 'number' ? String(v) : '';

/** Las opciones salen de los equipos activos ya consultados a Kora, sin tabla nueva. */
export function buildQuotationTaskTemplate(
  phase: string, teams: readonly QuotationTaskExcelTeam[],
): Uint8Array {
  if (!teams.length) throw new Error('No existen equipos activos de Kora.');
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, [phase, '', '', '']]);
  sheet['!cols'] = [{wch:36},{wch:55},{wch:28},{wch:14}];
  XLSX.utils.book_append_sheet(book, sheet, 'Tareas');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Equipos activos en Kora', 'ID (referencia)'], ...teams.map(t => [t.name, t.id]),
  ]), 'Equipos Kora');
  book.Workbook = { Names: [{
    Name: 'EquiposKora', Ref: "'Equipos Kora'!$A$2:$A$" + (teams.length + 1),
  }] };
  const bytes = new Uint8Array(XLSX.write(book, {bookType:'xlsx',type:'array'}));
  const cfb = XLSX.CFB.read(bytes, {type:'buffer'});
  const index = cfb.FullPaths.findIndex((p: string) =>
    p.toLowerCase().endsWith('/xl/worksheets/sheet1.xml'));
  const entry = index < 0 ? null : cfb.FileIndex[index];
  if (!entry?.content) throw new Error('No se encontró la hoja Tareas en XLSX.');
  const xml = new TextDecoder().decode(new Uint8Array(entry.content));
  if (!xml.includes('</sheetData>')) throw new Error('La plantilla XLSX es inválida.');
  const validation =
    '<dataValidations count="1"><dataValidation type="list" allowBlank="1" ' +
    'showDropDown="0" showErrorMessage="1" errorTitle="Equipo Kora" ' +
    'error="Selecciona un equipo de Kora." sqref="C2:C201">' +
    '<formula1>EquiposKora</formula1></dataValidation></dataValidations>';
  entry.content = new TextEncoder().encode(xml.replace('</sheetData>', '</sheetData>' + validation));
  entry.size = entry.content.length;
  return new Uint8Array(XLSX.CFB.write(cfb, {fileType:'zip',type:'array'}));
}
export function downloadQuotationTaskTemplate(
  phase: string, teams: readonly QuotationTaskExcelTeam[],
): void {
  const bytes = buildQuotationTaskTemplate(phase, teams);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'kora-plantilla-tareas-cotizacion.xlsx';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
/** Todas las filas se validan antes de retornar: no hay importación parcial. */
export async function readQuotationTaskExcel(
  file: File, phaseName: string, teams: readonly QuotationTaskExcelTeam[],
): Promise<ImportedQuotationTask[]> {
  if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MB.');
  if (!teams.length) throw new Error('No hay equipos activos de Kora.');
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Selecciona XLSX, XLS o CSV.');
  const book = XLSX.read(await file.arrayBuffer(), {type:'array'});
  const sheet = book.Sheets[book.SheetNames[0] ?? ''];
  if (!sheet) throw new Error('El archivo no contiene tareas.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header:1,defval:'',raw:true,blankrows:false,
  });
  if (!rows.length || !HEADERS.every((header,i) =>
    norm(str(rows[0]?.[i])) === norm(header))) {
    throw new Error('La plantilla requiere Fase, Tarea, Equipo y Horas.');
  }
  if (rows.length > 202) throw new Error('Máximo 200 tareas por archivo.');
  const result: ImportedQuotationTask[] = [];
  for (let i=1;i<rows.length;i++) {
    const [phaseCell, taskCell, teamCell, hourCell] = rows[i] ?? [];
    if (!str(taskCell) && !str(teamCell) && !str(hourCell)) continue;
    if (str(phaseCell) && norm(str(phaseCell)) !== norm(phaseName))
      throw new Error('Fila '+(i+1)+': pertenece a otra fase.');
    const name = str(taskCell);
    if (!name || name.length > 300)
      throw new Error('Fila '+(i+1)+': tarea obligatoria de hasta 300 caracteres.');
    const matches = teams.filter(team => norm(team.name) === norm(str(teamCell)));
    if (matches.length !== 1)
      throw new Error('Fila '+(i+1)+': equipo Kora inexistente o ambiguo.');
    const hours = typeof hourCell === 'number' ? hourCell : Number(str(hourCell).replace(',','.'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1_000_000 ||
        Math.round(hours * 100) / 100 !== hours)
      throw new Error('Fila '+(i+1)+': HH inválidas (máximo 2 decimales).');
    result.push({name,teamId:matches[0]!.id,hours});
  }
  if (!result.length) throw new Error('El archivo no contiene tareas.');
  return result;
}
