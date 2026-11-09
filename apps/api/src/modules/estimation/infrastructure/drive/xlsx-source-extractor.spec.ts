import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { extractXlsxSourceText, MAX_XLSX_SOURCE_BYTES } from './xlsx-source-extractor';

const makeBook = () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ID', 'Regla', 'Prioridad'],
    ['RN-01', 'Aprobación del supervisor', 'Alta'],
    ['RN-02', 'Bloqueo en plazo', 'Media'],
  ]), 'Matriz');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ID', 'Sistema', 'Protocolo'],
    ['INT-01', 'SAP', 'REST'],
  ]), 'Integración');
  return book;
};
const encode = (book: XLSX.WorkBook) =>
  Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array);

describe('XLSX para análisis documental IA (worker aislado)', () => {
  it('lee TODAS las hojas visibles y mantiene los identificadores de celdas', async () => {
    const text = await extractXlsxSourceText(encode(makeBook()));
    expect(text).toContain('HOJA "Matriz"');
    expect(text).toContain('A2="RN-01"');
    expect(text).toContain('B2="Aprobación del supervisor"');
    expect(text).toContain('HOJA "Integración"');
    expect(text).toContain('C2="REST"');
  }, 15000);

  it('informa hojas ocultas sin enviar su contenido a Gemini', async () => {
    const book = makeBook();
    book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
    const text = await extractXlsxSourceText(encode(book));
    expect(text).toContain('HOJAS OCULTAS OMITIDAS');
    expect(text).not.toContain('C2="REST"');
  }, 15000);

  it('no inventa resultados cuando una fórmula carece de valor cacheado', async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Plan', 'HH'], ['Dev', 20]]);
    sheet.B3 = { t: 'n', f: 'SUM(B2:B2)' };
    sheet['!ref'] = 'A1:B3';
    XLSX.utils.book_append_sheet(book, sheet, 'Esfuerzo');
    const output = await extractXlsxSourceText(encode(book));
    expect(output).toContain('fórmula sin resultado calculado');
  }, 15000);

  it('rechaza libros malformados y tamaño excedido, sin entregar texto parcial', async () => {
    await expect(extractXlsxSourceText(Buffer.from('no es un excel')))
      .rejects.toThrow(/contenedor XLSX/);
    await expect(extractXlsxSourceText(Buffer.alloc(MAX_XLSX_SOURCE_BYTES + 1)))
      .rejects.toThrow(/superior a 5 MB/);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,
      XLSX.utils.aoa_to_sheet([['Requisito', 'X'.repeat(1300)]]), 'Límite');
    await expect(extractXlsxSourceText(encode(book)))
      .rejects.toThrow(/1000 caracteres/);
  }, 15000);
});
