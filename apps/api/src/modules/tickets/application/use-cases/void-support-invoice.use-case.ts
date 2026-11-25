import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, err, ok, type ApplicationError, type Result, type UnitOfWork } from '@kora/core';
import { SupportInvoiceNotFoundError, SupportInvoicePaidCannotBeVoidedError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { periodBillingOf } from '../services/support-invoice-payment-status';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface VoidSupportInvoiceCommand {
  readonly invoiceId: string;
  readonly actor: ActorContext;
}

/**
 * Anula UNA factura de soporte registrada con un monto o folio equivocado —
 * solo si no está pagada. Las demás facturas del período se mantienen (pueden
 * estar pagadas: cada una se cobra por separado).
 *
 * - Si era la única del período, el período vuelve a quedar "por facturar".
 * - Si el período conserva otras, su monto vuelve a quedar por facturar: el
 *   período pasa a "facturado parcial" con el mismo total que tenía, para
 *   registrar la factura correcta. Las horas facturadas y los tickets
 *   enlazados a la anulada (siempre la primera del período) pasan a la
 *   primera de las que quedan, para no volver a cobrarlos.
 *
 * Folio, monto y período de la factura anulada quedan en la auditoría.
 */
@Injectable()
export class VoidSupportInvoiceUseCase implements UseCase<VoidSupportInvoiceCommand, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: VoidSupportInvoiceCommand): Promise<Result<void, ApplicationError>> {
    const { invoiceId, actor } = command;

    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) return err(new SupportInvoiceNotFoundError(invoiceId));
    if (invoice.paidAt) return err(new SupportInvoicePaidCannotBeVoidedError());

    const periodInvoices = await this.invoices.listByPlanAndPeriod(invoice.planId, invoice.periodKey);
    const remaining = periodInvoices.filter((item) => item.id !== invoice.id).sort((a, b) => a.position - b.position);
    const billing = periodBillingOf(periodInvoices.some((item) => item.id === invoice.id) ? periodInvoices : [...periodInvoices, invoice]);

    await this.unitOfWork.run(async (tx) => {
      const heir = remaining[0];
      if (heir && billing) {
        if (invoice.hoursBilled !== null) {
          await this.invoices.setHoursBilled(heir.id, round2((heir.hoursBilled ?? 0) + invoice.hoursBilled), tx);
        }
        await this.tickets.moveInvoiceLinks(invoice.id, heir.id, tx);
        await this.invoices.setPeriodTarget(invoice.planId, invoice.periodKey, billing.totalAmountUf, tx);
      }
      await this.invoices.removeMany([invoice.id], tx);
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'delete',
      entityType: 'support_invoice',
      entityId: invoice.id,
      metadata: {
        planId: invoice.planId,
        periodKey: invoice.periodKey,
        folio: invoice.folio,
        amountUf: invoice.amountUf,
        currency: invoice.currency,
        hoursBilled: invoice.hoursBilled,
        position: invoice.position,
        remainingInPeriod: remaining.length,
      },
    });

    return ok(undefined);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
