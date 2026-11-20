import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result, type UnitOfWork } from '@kora/core';
import { MAX_SUPPORT_INVOICES_PER_PERIOD, type MarkSupportInvoiceIssuedInput } from '@kora/contracts';
import {
  SupportInvoiceAlreadyExistsForPeriodError,
  SupportInvoiceFolioAlreadyInPeriodError,
  SupportInvoicePeriodNotPendingError,
  SupportInvoiceTooManyForPeriodError,
  SupportPlanNotFoundError,
  SupportPlanNothingToInvoiceError,
} from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import {
  SUPPORT_INVOICE_REPOSITORY,
  type CreateSupportInvoiceInput,
  type SupportInvoiceRecord,
  type SupportInvoiceRepository,
} from '../../domain/repositories/support-invoice.repository';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { SupportBillingCalculator } from '../services/support-billing-calculator';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import { periodBillingOf } from '../services/support-invoice-payment-status';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface MarkSupportInvoiceIssuedCommand {
  readonly planId: string;
  readonly data: MarkSupportInvoiceIssuedInput;
  readonly actor: ActorContext;
  readonly attachments?: ReadonlyMap<number, { name: string; content: string }>;
}

const DEFAULT_PAYMENT_TERM_DAYS = 30;

/**
 * Registra que un contrato de soporte ya fue facturado — Kora no emite la
 * factura, solo registra folio y fecha (ver el comentario de
 * `support_invoices` en el schema). El monto lo calcula
 * `SupportBillingCalculator` como referencia, pero lo que queda CONGELADO es
 * lo que se registra: el total se puede dividir en varias facturas.
 *
 * Las facturas de un período se pueden registrar juntas o en distintos
 * momentos (p. ej. una cuota mensual que el cliente paga en partes y se
 * factura a medida que paga):
 * - Si lo registrado suma menos que el calculado y no se pide cerrar el mes
 *   (`closePeriod`), el período queda "facturado parcial": el calculado se
 *   guarda como total esperado (`target_amount_uf`) y el saldo sigue por
 *   facturar hasta que se registren las que faltan (`periodKey`, o el mismo
 *   período del cálculo) o se cierre el mes por lo facturado.
 * - Con `closePeriod`, el período queda facturado por esa suma y la
 *   diferencia no se cobra — p. ej. una cuota fija que no cobra el excedente
 *   (las horas calculadas quedan como facturadas, igual que si se hubiera
 *   cobrado el total).
 *
 * Las horas y los tickets van solo en la primera factura del período — ver
 * `hours_billed` en el schema. Las que se agregan después no traen horas.
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

    if (data.periodKey) {
      const existing = await this.invoices.listByPlanAndPeriod(planId, data.periodKey);
      return this.appendToPeriod(data.periodKey, existing, command);
    }

    const linkedProjectIds = await this.summaryBuilder.resolveLinkedProjectIds(record);
    const calculation = await this.billing.calculate(record, linkedProjectIds, now, { monthlyPeriodId: data.monthlyPeriodId });
    if (!calculation) return err(new SupportPlanNothingToInvoiceError());

    const existing = await this.invoices.listByPlanAndPeriod(planId, calculation.periodKey);
    if (existing.length > 0) {
      // Un período "facturado parcial" sigue aceptando las facturas que le faltan.
      if (periodBillingOf(existing)?.status === 'partially_invoiced') return this.appendToPeriod(calculation.periodKey, existing, command);
      return err(new SupportInvoiceAlreadyExistsForPeriodError(calculation.periodKey));
    }

    const invoicedCents = data.invoices.reduce((total, invoice) => total + toCents(invoice.amountUf), 0);
    const targetAmountUf = !data.closePeriod && invoicedCents < toCents(calculation.amountUf) ? calculation.amountUf : null;

    const rows: CreateSupportInvoiceInput[] = data.invoices.map((invoice, index) =>
      this.toRow(command, index, {
        periodKey: calculation.periodKey,
        position: index,
        currency: record.currency,
        hoursBilled: index === 0 ? calculation.hoursBilled : null,
        monthlyPeriodId: calculation.monthlyPeriodId,
        targetAmountUf,
      }),
    );

    await this.unitOfWork.run(async (tx) => {
      await this.invoices.createMany(rows, tx);

      // Un ticket enlaza a una sola factura: la primera del período (`tickets.invoice_id` solo marca "ya facturado").
      const ticketIds =
        record.planType === 'on_demand'
          ? await this.tickets.findClosedUnbilledIds(linkedProjectIds, tx)
          : await this.tickets.findUnbilledIdsWithHoursBefore(linkedProjectIds, await this.coveredUntil(record, calculation, rows[0]!.invoicedAt), tx);
      await this.tickets.linkToInvoice(ticketIds, rows[0]!.id, tx);
    });

    await this.recordAudit(actor, planId, rows, {
      // Lo que calculó Kora — si difiere de la suma registrada, queda la traza.
      calculatedAmountUf: calculation.amountUf,
      closePeriod: data.closePeriod ?? false,
    });

    return ok({ ids: rows.map((row) => row.id) });
  }

  /**
   * Agrega facturas a un período "facturado parcial". Si con ellas se alcanza
   * el total esperado (o se pide `closePeriod`), el período queda cerrado.
   */
  private async appendToPeriod(
    periodKey: string,
    existing: readonly SupportInvoiceRecord[],
    command: MarkSupportInvoiceIssuedCommand,
  ): Promise<Result<{ ids: string[] }, ApplicationError>> {
    const { planId, data, actor } = command;
    const billing = periodBillingOf(existing);
    if (!billing || billing.status !== 'partially_invoiced') return err(new SupportInvoicePeriodNotPendingError(periodKey));

    if (existing.length + data.invoices.length > MAX_SUPPORT_INVOICES_PER_PERIOD) {
      return err(new SupportInvoiceTooManyForPeriodError(MAX_SUPPORT_INVOICES_PER_PERIOD));
    }
    const takenFolios = new Set(existing.map((invoice) => invoice.folio.trim()));
    const repeated = data.invoices.find((invoice) => takenFolios.has(invoice.folio.trim()));
    if (repeated) return err(new SupportInvoiceFolioAlreadyInPeriodError(repeated.folio.trim()));

    const first = [...existing].sort((a, b) => a.position - b.position)[0]!;
    const nextPosition = Math.max(...existing.map((invoice) => invoice.position)) + 1;
    const invoicedAfterCents = toCents(billing.invoicedAmountUf) + data.invoices.reduce((total, invoice) => total + toCents(invoice.amountUf), 0);
    const targetAmountUf = data.closePeriod || invoicedAfterCents >= toCents(billing.totalAmountUf) ? null : billing.totalAmountUf;

    const rows: CreateSupportInvoiceInput[] = data.invoices.map((_invoice, index) =>
      this.toRow(command, index, {
        periodKey,
        position: nextPosition + index,
        // La moneda y el período mensual son los de las facturas que ya tiene el período.
        currency: first.currency,
        hoursBilled: null,
        monthlyPeriodId: first.monthlyPeriodId,
        targetAmountUf,
      }),
    );

    await this.unitOfWork.run(async (tx) => {
      await this.invoices.createMany(rows, tx);
      await this.invoices.setPeriodTarget(planId, periodKey, targetAmountUf, tx);
    });

    await this.recordAudit(actor, planId, rows, {
      addedToPartialPeriod: true,
      pendingBeforeUf: billing.pendingAmountUf,
      closePeriod: data.closePeriod ?? false,
    });

    return ok({ ids: rows.map((row) => row.id) });
  }

  private toRow(
    command: MarkSupportInvoiceIssuedCommand,
    index: number,
    fields: Pick<CreateSupportInvoiceInput, 'periodKey' | 'position' | 'currency' | 'hoursBilled' | 'monthlyPeriodId' | 'targetAmountUf'>,
  ): CreateSupportInvoiceInput {
    const invoice = command.data.invoices[index]!;
    const invoicedAt = new Date(invoice.invoicedAt);
    const attachment = command.attachments?.get(index);
    return {
      id: this.ids.generate(),
      planId: command.planId,
      amountUf: toCents(invoice.amountUf) / 100,
      folio: invoice.folio,
      invoicedAt,
      dueAt: addDays(invoicedAt, DEFAULT_PAYMENT_TERM_DAYS),
      attachmentName: attachment?.name ?? invoice.attachmentName ?? null,
      attachmentContent: attachment?.content,
      ...fields,
    };
  }

  private async recordAudit(actor: ActorContext, planId: string, rows: readonly CreateSupportInvoiceInput[], extra: Record<string, unknown>): Promise<void> {
    for (const row of rows) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'create',
        entityType: 'support_invoice',
        entityId: row.id,
        metadata: {
          planId,
          periodKey: row.periodKey,
          amountUf: row.amountUf,
          folio: row.folio,
          position: row.position,
          targetAmountUf: row.targetAmountUf,
          ...extra,
        },
      });
    }
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
