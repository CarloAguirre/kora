import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result, type UnitOfWork } from '@kora/core';
import type { MarkSupportInvoiceIssuedInput } from '@kora/contracts';
import {
  SupportInvoiceAlreadyExistsForPeriodError,
  SupportPlanNotFoundError,
  SupportPlanNothingToInvoiceError,
} from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { SupportBillingCalculator } from '../services/support-billing-calculator';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface MarkSupportInvoiceIssuedCommand {
  readonly planId: string;
  readonly data: MarkSupportInvoiceIssuedInput;
  readonly actor: ActorContext;
}

const DEFAULT_PAYMENT_TERM_DAYS = 30;

/**
 * Registra que un contrato de soporte ya fue facturado — Kora no emite la
 * factura, solo registra folio y fecha (ver el comentario de
 * `support_invoices` en el schema). El monto lo calcula
 * `SupportBillingCalculator` y queda CONGELADO en la fila: no se recalcula
 * después aunque cambien las horas registradas.
 */
@Injectable()
export class MarkSupportInvoiceIssuedUseCase implements UseCase<MarkSupportInvoiceIssuedCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly billing: SupportBillingCalculator,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: MarkSupportInvoiceIssuedCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { planId, data, actor } = command;
    const now = this.clock.now();

    const plan = await this.plans.findById(planId);
    if (!plan) return err(new SupportPlanNotFoundError(planId));
    const record = plan.toSnapshot() as SupportPlanRecord;

    const linkedProjectIds = await this.summaryBuilder.resolveLinkedProjectIds(record);
    const calculation = await this.billing.calculate(record, linkedProjectIds, now);
    if (!calculation) return err(new SupportPlanNothingToInvoiceError());

    const existing = await this.invoices.findByPlanAndPeriod(planId, calculation.periodKey);
    if (existing) return err(new SupportInvoiceAlreadyExistsForPeriodError(calculation.periodKey));

    const invoiceId = this.ids.generate();
    const invoicedAt = new Date(data.invoicedAt);
    const dueAt = addDays(invoicedAt, DEFAULT_PAYMENT_TERM_DAYS);

    await this.unitOfWork.run(async (tx) => {
      await this.invoices.create(
        {
          id: invoiceId,
          planId,
          periodKey: calculation.periodKey,
          amountUf: calculation.amountUf,
          currency: record.currency,
          hoursBilled: calculation.hoursBilled,
          folio: data.folio,
          invoicedAt,
          dueAt,
          attachmentName: data.attachmentName ?? null,
          monthlyPeriodId: calculation.monthlyPeriodId,
        },
        tx,
      );

      if (record.planType === 'on_demand') {
        const ticketIds = await this.tickets.findClosedUnbilledIds(linkedProjectIds, tx);
        await this.tickets.linkToInvoice(ticketIds, invoiceId, tx);
      }
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'support_invoice',
      entityId: invoiceId,
      metadata: { planId, periodKey: calculation.periodKey, amountUf: calculation.amountUf, folio: data.folio },
    });

    return ok({ id: invoiceId });
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
