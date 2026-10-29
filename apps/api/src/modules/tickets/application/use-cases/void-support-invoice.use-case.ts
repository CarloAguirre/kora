import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { SupportInvoiceNotFoundError, SupportInvoicePaidCannotBeVoidedError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface VoidSupportInvoiceCommand {
  readonly invoiceId: string;
  readonly actor: ActorContext;
}

/**
 * Anula una factura de soporte registrada con un monto o folio equivocado:
 * borra la fila, así el período vuelve a quedar "por facturar" y se registra
 * de nuevo con el monto que corresponde. Solo si todavía no está pagada. El
 * folio, monto y período anulados quedan en la auditoría.
 */
@Injectable()
export class VoidSupportInvoiceUseCase implements UseCase<VoidSupportInvoiceCommand, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: VoidSupportInvoiceCommand): Promise<Result<void, ApplicationError>> {
    const { invoiceId, actor } = command;

    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) return err(new SupportInvoiceNotFoundError(invoiceId));
    if (invoice.paidAt) return err(new SupportInvoicePaidCannotBeVoidedError());

    await this.invoices.remove(invoiceId);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'delete',
      entityType: 'support_invoice',
      entityId: invoiceId,
      metadata: {
        planId: invoice.planId,
        periodKey: invoice.periodKey,
        folio: invoice.folio,
        amountUf: invoice.amountUf,
        currency: invoice.currency,
        hoursBilled: invoice.hoursBilled,
      },
    });

    return ok(undefined);
  }
}
