import { describe, expect, it, vi } from 'vitest';
import { projectInvoiceAttachments, projectPaymentReceipts, type Database } from '@kora/db';
import { DrizzleProjectPaymentMilestoneRepository } from './drizzle-project-payment-milestone.repository';

function setup(inserted = true) {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const deletedWhere = vi.fn().mockResolvedValue(undefined);
  const returning = vi.fn().mockResolvedValue(inserted ? [{ id: 'milestone-1' }] : []);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const db = {
    update: vi.fn(() => ({ set })),
    insert: vi.fn(() => ({ values })),
    delete: vi.fn(() => ({ where: deletedWhere })),
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation(async (work: (tx: typeof db) => Promise<void>) => work(db));
  const repository = new DrizzleProjectPaymentMilestoneRepository(db as unknown as Database);
  return { repository, db, values, set, where, onConflictDoNothing };
}

describe('Persistencia del PDF del tramo de proyecto', () => {
  it('registra el pago y su comprobante en una sola transaccion', async () => {
    const { repository, db, values, set } = setup();
    const paidAt = new Date('2026-11-10');
    const receipt = { name: 'boleta.png', mimeType: 'image/png' as const, content: 'iVBORw0KGgo=' };
    await repository.markPaid('milestone-1', paidAt, undefined, receipt);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ status: 'paid', paidAt, updatedAt: expect.any(Date) });
    expect(db.insert).toHaveBeenCalledWith(projectPaymentReceipts);
    expect(values).toHaveBeenCalledWith({ milestoneId: 'milestone-1', ...receipt });
  });

  it('propaga errores del comprobante para revertir el registro del pago', async () => {
    const { repository, values } = setup();
    values.mockImplementationOnce(() => { throw new Error('receipt write failed'); });
    await expect(repository.markPaid('milestone-1', new Date(), undefined, {
      name: 'boleta.png', mimeType: 'image/png', content: 'iVBORw0KGgo=',
    })).rejects.toThrow('receipt write failed');
  });

  it('no reemplaza un comprobante existente', async () => {
    const { repository, db, onConflictDoNothing } = setup(false);
    expect(await repository.attachPaymentReceipt('milestone-1', {
      name: 'otro.pdf', content: 'JVBERi0=', mimeType: 'application/pdf',
    })).toBe(false);
    expect(onConflictDoNothing).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('elimina el comprobante si se corrige un pago de vuelta a facturado', async () => {
    const { repository, db } = setup();
    await repository.update('milestone-1', { status: 'invoiced', paidAt: null });
    expect(db.delete).toHaveBeenCalledWith(projectPaymentReceipts);
    expect(db.delete).not.toHaveBeenCalledWith(projectInvoiceAttachments);
  });

  it('escribe el PDF en la conexion transaccional usada para registrar la factura', async () => {
    const { repository, db } = setup();
    const txValues = vi.fn().mockResolvedValue(undefined);
    const tx = { update: db.update, insert: vi.fn(() => ({ values: txValues })) };
    const attachment = { name: 'factura.pdf', content: 'JVBERi0=' };
    await repository.markIssued('milestone-1', {
      invoiceNumber: '4444', issuedAt: new Date('2026-11-10'), dueAt: new Date('2026-12-10'), attachment,
    }, { _brand: 'TransactionContext', tx } as unknown as import('@kora/core').TransactionContext);
    expect(tx.insert).toHaveBeenCalledWith(projectInvoiceAttachments);
    expect(txValues).toHaveBeenCalledWith({ milestoneId: 'milestone-1', ...attachment });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('agrega el PDF sin modificar montos, folio, pago ni fechas', async () => {
    const { repository, db, values } = setup();
    expect(await repository.attachDocument('milestone-1', { name: 'factura.pdf', content: 'JVBERi0=' })).toBe(true);
    expect(values).toHaveBeenCalledWith({ milestoneId: 'milestone-1', name: 'factura.pdf', content: 'JVBERi0=' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('no reemplaza el PDF si la factura ya tiene documento', async () => {
    const { repository, onConflictDoNothing } = setup(false);
    expect(await repository.attachDocument('milestone-1', { name: 'otro.pdf', content: 'JVBERi0=' })).toBe(false);
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it.each(['pending', 'to_invoice'] as const)('limpia el adjunto al devolver el tramo a %s', async (status) => {
    const { repository, db } = setup();
    await repository.update('milestone-1', { status });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.delete).toHaveBeenCalledWith(projectInvoiceAttachments);
  });

  it('conserva el adjunto al editar una factura vigente', async () => {
    const { repository, db } = setup();
    await repository.update('milestone-1', { name: 'Tramo corregido', status: 'paid' });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
