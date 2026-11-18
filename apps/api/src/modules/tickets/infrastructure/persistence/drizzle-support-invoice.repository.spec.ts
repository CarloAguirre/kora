import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@kora/db';
import { DrizzleSupportInvoiceRepository } from './drizzle-support-invoice.repository';
import { saveInvoiceDocument, discardNewInvoiceDocument } from '../../../../shared/infrastructure/storage/invoice-document.storage';

vi.mock('../../../../shared/infrastructure/storage/invoice-document.storage', () => ({
  saveInvoiceDocument: vi.fn().mockResolvedValue('kora-file:v1:support-invoice/00000000-0000-4000-8000-000000000001.pdf'),
  readInvoiceDocument: vi.fn(async (value: string) => value),
  discardNewInvoiceDocument: vi.fn().mockResolvedValue(undefined),
}));


function setup(inserted: boolean) {
  const returning = vi.fn().mockResolvedValue(inserted ? [{ invoiceId: 'invoice-1' }] : []);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const tx = { insert: vi.fn(() => ({ values })), update: vi.fn(() => ({ set })) };
  const database = { transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<boolean>) => work(tx)) };
  const repository = new DrizzleSupportInvoiceRepository(database as unknown as Database);
  return { repository, database, tx, values, onConflictDoNothing, set, where };
}

describe('Persistencia del PDF de una factura existente', () => {
  it('inserta el PDF y actualiza solo el nombre y updatedAt en la misma transaccion', async () => {
    const { repository, database, values, set } = setup(true);
    expect(await repository.attachDocument('invoice-1', { name: 'nuevo.pdf', content: 'JVBERi0=' })).toBe(true);
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith({ invoiceId: 'invoice-1', content: expect.stringMatching(/^kora-file:v1:support-invoice\//) });
    expect(set).toHaveBeenCalledWith({ attachmentName: 'nuevo.pdf', updatedAt: expect.any(Date) });
    expect(saveInvoiceDocument).toHaveBeenCalledWith('support-invoice', 'JVBERi0=');
  });

  it('no modifica ningun campo si otro PDF ya ocupa la clave de la factura', async () => {
    const { repository, onConflictDoNothing, tx } = setup(false);
    expect(await repository.attachDocument('invoice-1', { name: 'otro.pdf', content: 'JVBERi0=' })).toBe(false);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
    expect(discardNewInvoiceDocument).toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('propaga errores de escritura para que la transaccion no confirme un cambio parcial', async () => {
    const { repository, where } = setup(true);
    where.mockRejectedValue(new Error('database write failed'));
    await expect(repository.attachDocument('invoice-1', { name: 'nuevo.pdf', content: 'JVBERi0=' })).rejects.toThrow('database write failed');
    expect(discardNewInvoiceDocument).toHaveBeenCalled();
  });
});
