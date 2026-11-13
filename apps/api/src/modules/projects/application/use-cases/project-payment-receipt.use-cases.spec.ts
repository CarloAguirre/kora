import { describe, expect, it, vi } from 'vitest';
import type { ProjectPaymentMilestoneRepository, ProjectPaymentReceipt } from '../../domain/repositories/project-payment-milestone.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { AttachProjectPaymentReceiptUseCase, GetProjectPaymentReceiptUseCase } from './project-payment-receipt.use-cases';
import { MarkProjectPaymentMilestonePaidUseCase } from './mark-project-payment-milestone-paid.use-case';

const query = { projectId: 'project-1', milestoneId: 'milestone-1' };
const receipt: ProjectPaymentReceipt = { name: 'boleta.png', content: 'iVBORw0KGgo=', mimeType: 'image/png' };
const actor = { userId: 'finance-1', email: 'finance@example.test' };
const command = { ...query, receipt, actor };

function setup(options: { status?: string; projectId?: string; exists?: boolean; hasReceipt?: boolean; inserted?: boolean; document?: boolean } = {}) {
  const repository = {
    findById: vi.fn().mockResolvedValue(options.exists === false ? null : {
      projectId: options.projectId ?? query.projectId, status: options.status ?? 'paid', hasPaymentReceipt: options.hasReceipt ?? false,
    }),
    markPaid: vi.fn().mockResolvedValue(undefined),
    attachPaymentReceipt: vi.fn().mockResolvedValue(options.inserted ?? true),
    getPaymentReceipt: vi.fn().mockResolvedValue(options.document === false ? null : receipt),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const port = repository as unknown as ProjectPaymentMilestoneRepository;
  return {
    repository, audit,
    attach: new AttachProjectPaymentReceiptUseCase(port, audit as AuditRecorder),
    read: new GetProjectPaymentReceiptUseCase(port),
    pay: new MarkProjectPaymentMilestonePaidUseCase(port, audit as AuditRecorder),
  };
}

describe('Comprobantes de pago de proyectos', () => {
  it('guarda el comprobante junto con el pago', async () => {
    const { pay, repository } = setup({ status: 'invoiced' });
    expect((await pay.execute({ ...command, data: { paidAt: '2026-11-10' } })).isOk()).toBe(true);
    expect(repository.markPaid).toHaveBeenCalledWith(query.milestoneId, new Date('2026-11-10'), undefined, receipt);
  });

  it('mantiene el pago sin comprobante', async () => {
    const { pay, repository } = setup({ status: 'invoiced' });
    expect((await pay.execute({ ...query, actor, data: { paidAt: '2026-11-10' } })).isOk()).toBe(true);
    expect(repository.markPaid).toHaveBeenCalledWith(query.milestoneId, new Date('2026-11-10'), undefined, undefined);
  });

  it('completa un pago antiguo sin volver a registrarlo', async () => {
    const { attach, repository, audit } = setup();
    expect((await attach.execute(command)).isOk()).toBe(true);
    expect(repository.attachPaymentReceipt).toHaveBeenCalledWith(query.milestoneId, receipt);
    expect(repository.markPaid).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: { paymentReceiptName: receipt.name } }));
  });

  it.each(['pending', 'to_invoice', 'invoiced'])('no permite completar comprobantes de un tramo %s', async (status) => {
    const { attach, repository } = setup({ status });
    const result = await attach.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('PROJECT_PAYMENT_NOT_RECORDED');
    expect(repository.attachPaymentReceipt).not.toHaveBeenCalled();
  });

  it.each([{ exists: false }, { projectId: 'other-project' }])('rechaza tramos inexistentes o de otro proyecto: %j', async (options) => {
    const { attach, read, pay, repository } = setup(options);
    expect((await attach.execute(command)).isErr()).toBe(true);
    expect((await read.execute(query)).isErr()).toBe(true);
    expect((await pay.execute({ ...command, data: { paidAt: '2026-11-10' } })).isErr()).toBe(true);
    expect(repository.attachPaymentReceipt).not.toHaveBeenCalled();
    expect(repository.getPaymentReceipt).not.toHaveBeenCalled();
    expect(repository.markPaid).not.toHaveBeenCalled();
  });

  it.each([{ hasReceipt: true }, { inserted: false }])('no reemplaza el comprobante, incluso con cargas simultaneas: %j', async (options) => {
    const { attach, audit } = setup(options);
    const result = await attach.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('PAYMENT_RECEIPT_EXISTS');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('recupera los bytes y el MIME original del comprobante', async () => {
    const { read } = setup();
    const result = await read.execute(query);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual(receipt);
  });

  it('informa no encontrado cuando un pago no tiene archivo real', async () => {
    const { read } = setup({ document: false });
    const result = await read.execute(query);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('not_found');
  });
});
