import { describe, expect, it, vi } from 'vitest';
import type { ProjectPaymentMilestoneRepository } from '../../domain/repositories/project-payment-milestone.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { AttachProjectInvoiceDocumentUseCase, GetProjectInvoiceDocumentUseCase } from './project-invoice-document.use-cases';

const query = { projectId: 'project-1', milestoneId: 'milestone-1' };
const attachment = { name: 'factura.pdf', content: 'JVBERi0xLjQ=' };
const command = { ...query, attachment, actor: { userId: 'finance-1', email: 'finance@example.test' } };

function setup(options: { status?: string; projectId?: string; exists?: boolean; hasAttachment?: boolean; inserted?: boolean; document?: boolean } = {}) {
  const repository = {
    findById: vi.fn().mockResolvedValue(options.exists === false ? null : {
      projectId: options.projectId ?? query.projectId, status: options.status ?? 'invoiced', hasAttachment: options.hasAttachment ?? false,
    }),
    attachDocument: vi.fn().mockResolvedValue(options.inserted ?? true),
    getAttachment: vi.fn().mockResolvedValue(options.document === false ? null : attachment),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const port = repository as unknown as ProjectPaymentMilestoneRepository;
  return {
    repository, audit,
    attach: new AttachProjectInvoiceDocumentUseCase(port, audit as AuditRecorder),
    read: new GetProjectInvoiceDocumentUseCase(port),
  };
}

describe('Documento de factura de proyecto', () => {
  it.each(['invoiced', 'paid'])('agrega el PDF de un tramo %s sin volver a facturarlo', async (status) => {
    const { attach, repository, audit } = setup({ status });
    expect((await attach.execute(command)).isOk()).toBe(true);
    expect(repository.attachDocument).toHaveBeenCalledWith(query.milestoneId, attachment);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'update', entityType: 'project_payment_milestone', entityId: query.milestoneId,
      metadata: { attachmentName: attachment.name },
    }));
  });

  it.each(['pending', 'to_invoice'])('no permite adjuntar antes de registrar la factura: %s', async (status) => {
    const { attach, repository } = setup({ status });
    const result = await attach.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('PROJECT_INVOICE_NOT_ISSUED');
    expect(repository.attachDocument).not.toHaveBeenCalled();
  });

  it.each([{ exists: false }, { projectId: 'other-project' }])('rechaza tramos inexistentes o de otro proyecto: %j', async (options) => {
    const { attach, read, repository } = setup(options);
    expect((await attach.execute(command)).isErr()).toBe(true);
    expect((await read.execute(query)).isErr()).toBe(true);
    expect(repository.attachDocument).not.toHaveBeenCalled();
    expect(repository.getAttachment).not.toHaveBeenCalled();
  });

  it.each([{ hasAttachment: true }, { inserted: false }])('no reemplaza el PDF, incluso ante cargas simultaneas: %j', async (options) => {
    const { attach, audit } = setup(options);
    const result = await attach.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('INVOICE_ATTACHMENT_EXISTS');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('recupera el PDF con su nombre original', async () => {
    const { read, repository } = setup();
    const result = await read.execute(query);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual(attachment);
    expect(repository.getAttachment).toHaveBeenCalledWith(query.milestoneId);
  });

  it('informa no encontrado si no existe un PDF real', async () => {
    const { read } = setup({ document: false });
    const result = await read.execute(query);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('not_found');
  });
});
