import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

/**
 * El contrato y las rutas HTTP continúan devolviendo base64, pero el
 * almacenamiento NUEVO es un archivo privado en el sistema de archivos.
 * Las filas históricas de PostgreSQL contienen base64 y siguen siendo legibles.
 *
 * El prefijo en "content" permite coexistencia sin migrar ni borrar bytes.
 * Los archivos físicos NO se sirven como recursos estáticos ni se usa el
 * nombre enviado por el navegador como ruta.
 */
const PREFIX = 'kora-file:v1:';
export type InvoiceDocumentKind = 'project-invoice' | 'support-invoice' | 'project-receipt';

function storageRoot(): string {
  const configured = process.env.INVOICE_STORAGE_DIR?.trim();
  // Es peligroso persistir en la capa efímera del contenedor en producción.
  if (process.env.NODE_ENV === 'production' && (!configured || !isAbsolute(configured))) {
    throw new Error('INVOICE_STORAGE_DIR debe configurar una ruta absoluta persistente montada en el contenedor.');
  }
  if (configured && !isAbsolute(configured)) {
    throw new Error('INVOICE_STORAGE_DIR debe ser una ruta absoluta.');
  }
  return resolve(configured ?? join(process.cwd(), 'apps', 'api', 'uploads', 'invoices'));
}

function extension(kind: InvoiceDocumentKind, mimeType?: string): string {
  if (kind !== 'project-receipt') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'pdf';
}

function resolveReference(reference: string): string | null {
  if (!reference.startsWith(PREFIX)) return null;
  const match = /^kora-file:v1:(project-invoice|support-invoice|project-receipt)\/([0-9a-f-]{36})\.(pdf|png|jpg)$/.exec(reference);
  if (!match) throw new Error('Referencia de archivo de factura inválida.');
  const root = storageRoot();
  const destination = resolve(root, match[1]!, match[2]! + '.' + match[3]!);
  if (!destination.startsWith(root + sep)) throw new Error('Ruta de factura fuera del almacenamiento permitido.');
  return destination;
}

export async function saveInvoiceDocument(
  kind: InvoiceDocumentKind,
  base64: string,
  mimeType?: string,
): Promise<string> {
  const folder = join(storageRoot(), kind);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const filename = randomUUID() + '.' + extension(kind, mimeType);
  const filenamePath = join(folder, filename);
  // Se escribe con un nombre aleatorio y creación exclusiva para evitar
  // colisiones y no aceptar rutas proporcionadas por el cliente.
  await writeFile(filenamePath, Buffer.from(base64, 'base64'), { flag: 'wx', mode: 0o600 });
  return PREFIX + kind + '/' + filename;
}

export async function readInvoiceDocument(content: string): Promise<string> {
  const filePath = resolveReference(content);
  if (!filePath) return content; // Documento anterior persistido en PostgreSQL.
  return (await readFile(filePath)).toString('base64');
}

export async function discardNewInvoiceDocument(reference: string): Promise<void> {
  const filePath = resolveReference(reference);
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function isFileBackedInvoiceDocument(content: string): boolean {
  return content.startsWith(PREFIX);
}
