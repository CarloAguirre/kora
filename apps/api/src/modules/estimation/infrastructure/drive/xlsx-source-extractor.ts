import { Worker } from 'node:worker_threads';

export const XLSX_ANALYSIS_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_XLSX_SOURCE_BYTES = 5 * 1024 * 1024;

/**
 * El XLSX es entrada documental NO confiable. SheetJS 0.18.5 se usa también
 * en el frontend, pero sus vulnerabilidades de parsing hacen obligatorio
 * aislarlo: worker V8 con límite de memoria y deadline, sin credenciales ni
 * objetos de la aplicación en workerData.
 *
 * El texto se entrega a Gemini con nombre de hoja + coordenada de cada celda
 * para conservar trazabilidad. No evaluamos fórmulas ni recortamos planillas:
 * cualquier límite excedido se notifica como omisión de cobertura.
 */
const WORKER_SCRIPT = String.raw`
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const XLSX = require(workerData.modulePath);
const fail = (why) => { throw new Error('Excel: ' + why); };
const MAX_SHEETS = 20;
const MAX_ROWS = 1200;
const MAX_COLUMNS = 80;
const MAX_CELLS = 12000;
const MAX_TEXT_CHARS = 140000;
const MAX_CELL_CHARS = 1000;
function stringifyCell(cell) {
  if (!cell || cell.t === 'z') return '';
  if (cell.f && (cell.v === undefined || cell.v === null)) {
    return '[fórmula sin resultado calculado: =' + String(cell.f) + ']';
  }
  if (cell.v === null || cell.v === undefined) return '';
  const formatted = cell.w !== undefined ? String(cell.w)
    : XLSX.utils.format_cell(cell);
  return formatted.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\r\n?/g, '\n').trim();
}
try {
  const workbook = XLSX.read(Buffer.from(workerData.bytes), {
    type: 'buffer', dense: true, sheetRows: MAX_ROWS + 1,
    cellText: true, cellFormula: true, bookVBA: false,
  });
  if (!workbook.SheetNames.length) fail('el libro no contiene hojas.');
  if (workbook.SheetNames.length > MAX_SHEETS) {
    fail('el libro supera ' + MAX_SHEETS + ' hojas; no se analizó parcialmente.');
  }
  const lines = ['Libro Excel (datos tabulares; se indican hojas y celdas).'];
  let cells = 0;
  let skippedHidden = [];
  for (let index = 0; index < workbook.SheetNames.length; index++) {
    const sheetName = workbook.SheetNames[index];
    if (workbook.Workbook && workbook.Workbook.Sheets &&
        workbook.Workbook.Sheets[index] && workbook.Workbook.Sheets[index].Hidden) {
      skippedHidden.push(sheetName);
      continue;
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      lines.push('HOJA ' + JSON.stringify(sheetName) + ': sin celdas con datos.');
      continue;
    }
    // sheetRows puede ajustar !ref; !fullref retiene el rango original.
    const originalRef = sheet['!fullref'] || sheet['!ref'];
    const range = XLSX.utils.decode_range(originalRef);
    if (range.e.r - range.s.r + 1 > MAX_ROWS ||
        range.e.r >= MAX_ROWS || range.e.c - range.s.c + 1 > MAX_COLUMNS) {
      fail('la hoja ' + JSON.stringify(sheetName) +
        ' supera el límite de 1200 filas o 80 columnas; no se analizó parcialmente.');
    }
    lines.push('HOJA ' + JSON.stringify(sheetName) + ':');
    let dataRows = 0;
    for (let row = range.s.r; row <= range.e.r; row++) {
      const values = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[row] && sheet[row][col];
        const value = stringifyCell(cell);
        if (!value) continue;
        if (value.length > MAX_CELL_CHARS) fail('hay celdas de más de 1000 caracteres en ' +
          JSON.stringify(sheetName) + '; no se analizó parcialmente.');
        if (++cells > MAX_CELLS) fail('el libro supera 12000 celdas con contenido.');
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        values.push(address + '=' + JSON.stringify(value));
      }
      if (values.length) {
        lines.push('Fila ' + (row + 1) + ': ' + values.join(' | '));
        dataRows++;
      }
      if (lines.join('\n').length > MAX_TEXT_CHARS) {
        fail('el texto supera 140000 caracteres; no se analizó parcialmente.');
      }
    }
    if (!dataRows) lines.push('(sin datos legibles en esta hoja)');
  }
  if (skippedHidden.length) lines.push(
    'HOJAS OCULTAS OMITIDAS: ' + skippedHidden.map((n) => JSON.stringify(n)).join(', '));
  if (!cells) fail('el libro no contiene celdas visibles con datos legibles.');
  const text = lines.join('\n');
  if (text.length > MAX_TEXT_CHARS) fail('el texto del libro supera el presupuesto permitido.');
  parentPort.postMessage({ ok: true, text });
} catch (error) {
  const message = error instanceof Error && error.message.startsWith('Excel:')
    ? error.message : 'Excel: el libro es inválido o no se pudo interpretar.';
  parentPort.postMessage({ ok: false, message });
}
`;

export async function extractXlsxSourceText(binary: Buffer): Promise<string> {
  if (!binary.length || binary.length > MAX_XLSX_SOURCE_BYTES) {
    throw new Error('Excel: archivo vacío o superior a 5 MB.');
  }
  if (binary[0] !== 0x50 || binary[1] !== 0x4b) {
    throw new Error('Excel: el archivo no tiene un contenedor XLSX válido.');
  }

  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { bytes: binary, modulePath: require.resolve('xlsx') },
      resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16 },
    });
    let completed = false;
    const finish = (error: Error | null, text?: string) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (error) reject(error);
      else resolve(text!);
    };
    const timeout = setTimeout(() =>
      finish(new Error('Excel: se superó el tiempo máximo de lectura de 8 segundos.')),
    8000);
    worker.once('message', (result: { ok: boolean; text?: string; message?: string }) => {
      if (!result.ok || !result.text) {
        finish(new Error(result.message ?? 'Excel: no se pudo extraer el contenido.'));
      } else finish(null, result.text);
    });
    worker.once('error', () => finish(new Error('Excel: falló el proceso aislado de lectura.')));
    worker.once('exit', (code) => {
      if (code !== 0) finish(new Error('Excel: se interrumpió el proceso aislado de lectura.'));
    });
  });
}
