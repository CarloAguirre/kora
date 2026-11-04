import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result, type UnitOfWork } from '@kora/core';
import type { MarkSupportInvoiceIssuedInput } from '@kora/contracts';
import {
  SupportInvoiceAlreadyExistsForPeriodError,
  SupportPlanNotFoundError,
  SupportPlanNothingToInvoiceError,
} from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import {
  SUPPORT_INVOICE_REPOSITORY,
  type CreateSupportInvoiceInput,
  type SupportInvoiceRepository,
} from '../../domain/repositories/support-invoice.repository';
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
 * `SupportBillingCalculator` como referencia, pero lo que queda CONGELADO es
 * lo que se registra: el total se puede dividir en varias facturas (todas
 * juntas) y su suma puede diferir del calculado — p. ej. un contrato mensual
 * con cuota fija que no cobra el excedente. La UI avisa la diferencia antes
 * de guardar; una vez registrado, el período queda facturado por esa suma y
 * la diferencia no se vuelve a cobrar (las horas calculadas quedan como
 * facturadas, igual que si se hubiera cobrado el total). Las horas van solo
 * en la primera factura — ver `hours_billed` en el schema.
 */
@Injectable()
export class MarkSupportInvoiceIssuedUseCase implements UseCase<MarkSupportInvoiceIssuedCommand, { ids: string[] }, ApplicationError> {
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

  async execute(command: MarkSupportInvoiceIssuedCommand): Promise<Result<{ ids: string[] }, ApplicationError>> {
    const { planId, data, actor } = command;
    const now = this.clock.now();

    const plan = await this.plans.findById(planId);
    if (!plan) return err(new SupportPlanNotFoundError(planId));
    const record = plan.toSnapshot() as SupportPlanRecord;

    const linkedProjectIds = await this.summaryBuilder.resolveLinkedProjectIds(record);
    const calculation = await this.billing.calculate(record, linkedProjectIds, now, { monthlyPeriodId: data.monthlyPeriodId });
    if (!calculation) return err(new SupportPlanNothingToInvoiceError());

    const existing = await this.invoices.listByPlanAndPeriod(planId, calculation.periodKey);
    if (existing.length > 0) return err(new SupportInvoiceAlreadyExistsForPeriodError(calculation.periodKey));

    const amounts = data.invoices.map((invoice) => toCents(invoice.amountUf));

    const rows: CreateSupportInvoiceInput[] = data.invoices.map((invoice, position) => {
      const invoicedAt = new Date(invoice.invoicedAt);
      return {
        id: this.ids.generate(),
        planId,
        periodKey: calculation.periodKey,
        amountUf: amounts[position]! / 100,
        currency: record.currency,
        hoursBilled: position === 0 ? calculation.hoursBilled : null,
        position,
        folio: invoice.folio,
        invoicedAt,
        dueAt: addDays(invoicedAt, DEFAULT_PAYMENT_TERM_DAYS),
        attachmentName: invoice.attachmentName ?? null,
        monthlyPeriodId: calculation.monthlyPeriodId,
      };
    });

    await this.unitOfWork.run(async (tx) => {
      await this.invoices.createMany(rows, tx);

      // Un ticket enlaza a una sola factura: la primera del período (`tickets.invoice_id` solo marca "ya facturado").
      const ticketIds =
        record.planType === 'on_demand'
          ? await this.tickets.findClosedUnbilledIds(linkedProjectIds, tx)
          : await this.tickets.findUnbilledIdsWithHoursBefore(linkedProjectIds, await this.coveredUntil(record, calculation, rows[0]!.invoicedAt), tx);
      await this.tickets.linkToInvoice(ticketIds, rows[0]!.id, tx);
    });

    for (const row of rows) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'create',
        entityType: 'support_invoice',
        entityId: row.id,
        metadata: {
          planId,
          periodKey: calculation.periodKey,
          amountUf: row.amountUf,
          folio: row.folio,
          position: row.position,
          // Lo que calculó Kora — si difiere de la suma registrada, queda la traza.
          calculatedAmountUf: calculation.amountUf,
        },
      });
    }

    return ok({ ids: rows.map((row) => row.id) });
  }

  /**
   * Hasta cuándo (exclusivo) cubre la factura las horas de los tickets: en
   * `monthly`, el fin del período facturado — así también entran los tickets
   * de meses anteriores que quedaron sin enlazar (con horas cargadas después
   * de facturar ese mes); en `bundle`, el día de emisión inclusive.
   */
  private async coveredUntil(record: SupportPlanRecord, calculation: { monthlyPeriodId: string | null }, invoicedAt: Date): Promise<Date> {
    if (calculation.monthlyPeriodId) {
      const period = (await this.plans.listPeriodsForPlan(record.id)).find((item) => item.id === calculation.monthlyPeriodId);
      if (period) return period.endDate;
    }
    return addDays(invoicedAt, 1);
  }
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
