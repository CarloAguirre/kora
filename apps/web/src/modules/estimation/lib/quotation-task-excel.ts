import * as XLSX from 'xlsx';

/** El catálogo de tipos viene literalmente del prototipo Kora v5. */
export const QUOTATION_TASK_TYPES = [
  'Sin tipo', 'Diseño de flujo y maquetas', 'Login y registro',
  'CRUD / mantenedor', 'Pantalla de consulta', 'Integración con API',
  'Notificaciones', 'Reportería', 'Carga masiva', 'Bot / automatización',
  'Modelo o agente IA', 'Pruebas funcionales', 'UAT',
  'Gestión y seguimiento', 'Despliegue', 'Marcha blanca',
] as const;
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

export function downloadQuotationTaskTemplate(
  phaseName: string, teams: readonly QuotationTaskExcelTeam[],
): void {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    [phaseName, '', '', 'Sin tipo', ''],
  ]);
  sheet['!cols'] = [{ wch: 36 }, { wch: 55 }, { wch: 26 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(book, sheet, 'Tareas');
  const catalog = XLSX.utils.aoa_to_sheet([
    ['Equipos activos en Kora', 'ID (referencia)'],
    ...teams.map((team) => [team.name, team.id]),
  ]);
  catalog['!cols'] = [{ wch: 34 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(book, catalog, 'Equipos Kora');
  const types = XLSX.utils.aoa_to_sheet([
    ['Tipos permitidos (catálogo)'], ...QUOTATION_TASK_TYPES.map((t) => [t]),
  ]);
  types['!cols'] = [{ wch: 36 }];
  XLSX.utils.book_append_sheet(book, types, 'Tipos catálogo');
  XLSX.writeFile(book, 'kora-plantilla-tareas-cotizacion.xlsx');
}

/** Lectura REAL de XLSX/CSV. Ante cualquier error no se importará fila alguna. */
export async function readQuotationTaskExcel(
  file: File, phaseName: string, activeTeams: readonly QuotationTaskExcelTeam[],
): Promise<ImportedQuotationTask[]> {
  if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera el límite de 2 MB.');
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
    if (!QUOTATION_TASK_TYPES.some((kind) =>
      normalize(kind) === normalize(classification))) {
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
      classification: QUOTATION_TASK_TYPES.find((kind) =>
        normalize(kind) === normalize(classification)) ?? 'Sin tipo',
    });
  }
  if (!result.length) throw new Error('El archivo no contiene tareas para importar.');
  return result;
}
