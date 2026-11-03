import * as XLSX from 'xlsx';

import type { QuotationTaskCatalogEntry } from '@kora/contracts';

/** Nombres, orden y estado vienen del catálogo activo PostgreSQL. */
export type QuotationTaskType = QuotationTaskCatalogEntry;
export type QuotationTaskExcelTeam = { id: string; name: string };
export type ImportedQuotationTask = {
  name: string; teamId: string; classification: string; hours: number;
};
const HEADERS = ['Fase', 'Tarea', 'Equipo', 'Tipo (catálogo)', 'Horas'];
const normalize = (value: string) => value.toLocaleLowerCase('es-CL')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const text = (value: unknown) => typeof value === 'string' ? value.trim() :
  typeof value === 'number' ? String(value) : '';
const round = (value: number) => Math.round(value * 100) / 100;

const MAX_ROWS = 200;

/** SheetJS incluye CFB para archivos ZIP OOXML; así se evitan dependencias nuevas.
 * Los dos rangos de validación SON listas nativas de Excel, no textos de ayuda.
 */
export function buildQuotationTaskTemplate(
  phaseName: string, teams: readonly QuotationTaskExcelTeam[],
  types: readonly QuotationTaskType[],
): Uint8Array {
  if (!teams.length || !types.length) {
    throw new Error('No hay equipos o tipos activos en Kora para preparar la plantilla.');
  }
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS, [phaseName, '', '', types[0]!.name, ''],
  ]);
  sheet['!cols'] = [{ wch: 36 }, { wch: 55 }, { wch: 26 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(book, sheet, 'Tareas');
  const teamCatalog = XLSX.utils.aoa_to_sheet([
    ['Equipos activos en Kora', 'ID (referencia)'],
    ...teams.map((team) => [team.name, team.id]),
  ]);
  teamCatalog['!cols'] = [{ wch: 34 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(book, teamCatalog, 'Equipos Kora');
  const typeCatalog = XLSX.utils.aoa_to_sheet([
    ['Tipos activos de cotización'], ...types.map((row) => [row.name]),
  ]);
  typeCatalog['!cols'] = [{ wch: 36 }];
  XLSX.utils.book_append_sheet(book, typeCatalog, 'Tipos catálogo');

  // Definiciones Excel: la lista puede estar en otra hoja y sigue actualizando
  // sus opciones al editar las celdas auxiliares descargadas de la BD.
  book.Workbook = { Names: [
    { Name: 'EquiposKora', Ref: "'Equipos Kora'!$A$2:$A$" + (teams.length + 1) },
    { Name: 'TiposCotizacion', Ref: "'Tipos catálogo'!$A$2:$A$" + (types.length + 1) },
  ] };
  const original = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }));
  // La versión Community de SheetJS no emite restricciones de lista en el
  // writer; se incorporan mediante el contenedor ZIP OOXML de XLSX.CFB.
  const cfb = XLSX.CFB.read(original, { type: 'buffer' });
  const location = 'xl/worksheets/sheet1.xml';
  const sheetIndex = cfb.FullPaths.findIndex((name) =>
    name.toLowerCase().endsWith('/' + location));
  const sheetFile = sheetIndex < 0 ? null : cfb.FileIndex[sheetIndex];
  if (!sheetFile?.content) throw new Error('No se pudo preparar el XML de la hoja Tareas.');
  const xml = new TextDecoder().decode(new Uint8Array(sheetFile.content));
  const validations =
    '<dataValidations count="2">' +
      '<dataValidation type="list" allowBlank="1" showDropDown="0" ' +
        'showErrorMessage="1" errorTitle="Equipo Kora" ' +
        'error="Selecciona un equipo de la lista." sqref="C2:C' + (MAX_ROWS + 1) + '">' +
        '<formula1>EquiposKora</formula1></dataValidation>' +
      '<dataValidation type="list" allowBlank="1" showDropDown="0" ' +
        'showErrorMessage="1" errorTitle="Tipo de tarea" ' +
        'error="Selecciona un tipo del catálogo." sqref="D2:D' + (MAX_ROWS + 1) + '">' +
        '<formula1>TiposCotizacion</formula1></dataValidation>' +
    '</dataValidations>';
  if (!xml.includes('</sheetData>')) throw new Error('La hoja Tareas no tiene celdas.');
  const updated = xml.replace('</sheetData>', '</sheetData>' + validations);
  // Modificar la entrada existente evita inconsistencias con rutas ZIP relativas.
  sheetFile.content = new TextEncoder().encode(updated);
  sheetFile.size = sheetFile.content.length;
  const packed = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' });
  return new Uint8Array(packed);
}

export function downloadQuotationTaskTemplate(
  phaseName: string, teams: readonly QuotationTaskExcelTeam[],
  types: readonly QuotationTaskType[],
): void {
  const content = buildQuotationTaskTemplate(phaseName, teams, types);
  const blob = new Blob([new Uint8Array(content)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'kora-plantilla-tareas-cotizacion.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

/** Lectura REAL de XLSX/CSV. Ante cualquier error no se importará fila alguna. */
export async function readQuotationTaskExcel(
  file: File, phaseName: string, activeTeams: readonly QuotationTaskExcelTeam[],
  activeTypes: readonly QuotationTaskType[],
): Promise<ImportedQuotationTask[]> {
  if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera el límite de 2 MB.');
  if (!activeTeams.length || !activeTypes.length) throw new Error('El catálogo Kora no está disponible.');
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Selecciona XLSX, XLS o CSV.');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0] ?? ''];
  if (!sheet) throw new Error('El archivo no contiene una hoja de tareas.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, defval: '', raw: true, blankrows: false,
  });
  if (!rows.length || !HEADERS.every((header, index) =>
    normalize(text(rows[0]?.[index])) === normalize(header))) {
    throw new Error('La plantilla debe contener Fase, Tarea, Equipo, Tipo (catálogo) y Horas.');
  }
  if (rows.length > 202) throw new Error('El Excel contiene demasiadas filas (máximo 200 tareas).');
  const result: ImportedQuotationTask[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const [phaseCell, taskCell, teamCell, kindCell, hoursCell] = row;
    // La plantilla descargable incluye una línea preparada sin datos de tarea.
    if (!text(taskCell) && !text(teamCell) && !text(hoursCell)) continue;
    if (text(phaseCell) && normalize(text(phaseCell)) !== normalize(phaseName)) {
      throw new Error('Fila ' + (i + 1) + ': pertenece a otra fase.');
    }
    const name = text(taskCell);
    if (!name || name.length > 300) {
      throw new Error('Fila ' + (i + 1) + ': escribe una tarea de hasta 300 caracteres.');
    }
    const matching = activeTeams.filter((team) =>
      normalize(team.name) === normalize(text(teamCell)));
    if (matching.length !== 1) {
      throw new Error('Fila ' + (i + 1) + ': equipo inexistente o ambiguo en Kora: ' +
        (text(teamCell) || '(vacío)'));
    }
    const classification = text(kindCell) || 'Sin tipo';
    if (!activeTypes.some((kind) =>
      normalize(kind.name) === normalize(classification))) {
      throw new Error('Fila ' + (i + 1) + ': tipo fuera del catálogo.');
    }
    const rawHours = typeof hoursCell === 'number'
      ? hoursCell : Number(text(hoursCell).replace(',', '.'));
    if (!Number.isFinite(rawHours) || rawHours <= 0 || rawHours > 1_000_000 ||
        round(rawHours) !== rawHours) {
      throw new Error('Fila ' + (i + 1) + ': Horas debe ser positiva, con hasta 2 decimales.');
    }
    result.push({
      name, teamId: matching[0]!.id, hours: rawHours,
      classification: activeTypes.find((kind) =>
        normalize(kind.name) === normalize(classification))?.name ?? 'Sin tipo',
    });
  }
  if (!result.length) throw new Error('El archivo no contiene tareas para importar.');
  return result;
}
