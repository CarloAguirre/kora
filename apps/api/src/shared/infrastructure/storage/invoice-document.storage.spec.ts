import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveInvoiceDocument, readInvoiceDocument, discardNewInvoiceDocument,
  isFileBackedInvoiceDocument,
} from './invoice-document.storage';

let tempDir: string;
let previousRoot: string | undefined;
let previousNodeEnv: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kora-billing-'));
  previousRoot = process.env.INVOICE_STORAGE_DIR;
  previousNodeEnv = process.env.NODE_ENV;
  process.env.INVOICE_STORAGE_DIR = tempDir;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  if (previousRoot === undefined) delete process.env.INVOICE_STORAGE_DIR;
  else process.env.INVOICE_STORAGE_DIR = previousRoot;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  await rm(tempDir, { recursive: true, force: true });
});

describe('Almacenamiento de facturas en el directorio privado de la API', () => {
  it('escribe un PDF físico, guarda una referencia breve y recupera su base64 original', async () => {
    const original = Buffer.from('%PDF-1.4\nContenido de factura').toString('base64');
    const ref = await saveInvoiceDocument('project-invoice', original);
    expect(ref).toMatch(/^kora-file:v1:project-invoice\/[0-9a-f-]{36}\.pdf$/);
    const files = await readdir(join(tempDir, 'project-invoice'));
    expect(files).toHaveLength(1);
    expect((await readFile(join(tempDir, 'project-invoice', files[0]!))).toString('base64')).toBe(original);
    expect(await readInvoiceDocument(ref)).toBe(original);
  });

  it('sirve documentos históricos que permanecen en base64 en PostgreSQL', async () => {
    const oldPdf = Buffer.from('%PDF-1.4\nDocumento histórico').toString('base64');
    expect(isFileBackedInvoiceDocument(oldPdf)).toBe(false);
    expect(await readInvoiceDocument(oldPdf)).toBe(oldPdf);
  });

  it('mantiene el MIME/extensión de comprobantes y permite descartar escrituras fallidas', async () => {
    const original = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
    const ref = await saveInvoiceDocument('project-receipt', original, 'image/png');
    expect(ref).toMatch(/\.png$/);
    expect(await readInvoiceDocument(ref)).toBe(original);
    await discardNewInvoiceDocument(ref);
    expect(await readdir(join(tempDir, 'project-receipt'))).toEqual([]);
  });

  it('rechaza referencias manipuladas en vez de leer archivos fuera del directorio', async () => {
    await expect(readInvoiceDocument('kora-file:v1:project-invoice/../../etc/passwd'))
      .rejects.toThrow('Referencia de archivo de factura inválida');
  });

  it('no escribe nuevas facturas en un contenedor productivo sin volumen configurado', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INVOICE_STORAGE_DIR;
    await expect(saveInvoiceDocument('support-invoice', 'JVBERi0='))
      .rejects.toThrow(/INVOICE_STORAGE_DIR/);
  });
});
