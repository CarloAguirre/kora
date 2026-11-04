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
 * Anula una factura de soporte registrada con un monto o folio equivocado.
 * Como el total de un período se registra de una vez (aunque esté dividido en
 * varias facturas), se anulan JUNTAS todas las facturas del período: borrar
 * solo una dejaría el período "facturado" por menos de lo que corresponde.
 * Así el período vuelve a quedar "por facturar" y se registra de nuevo con el
 * monto correcto. Solo si ninguna está pagada. Folio, monto y período de cada
 * factura anulada quedan en la auditoría.
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

    const periodInvoices = await this.invoices.listByPlanAndPeriod(invoice.planId, invoice.periodKey);
    const toVoid = periodInvoices.some((item) => item.id === invoice.id) ? periodInvoices : [invoice];
    const paidSibling = toVoid.find((item) => item.paidAt);
    if (paidSibling) return err(new SupportInvoicePaidCannotBeVoidedError(paidSibling.folio));

    await this.invoices.removeMany(toVoid.map((item) => item.id));

    for (const voided of toVoid) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'delete',
        entityType: 'support_invoice',
        entityId: voided.id,
        metadata: {
          planId: voided.planId,
          periodKey: voided.periodKey,
          folio: voided.folio,
          amountUf: voided.amountUf,
          currency: voided.currency,
          hoursBilled: voided.hoursBilled,
          position: voided.position,
        },
      });
    }

    return ok(undefined);
  }
}
