import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { SupportPlanWithInvoices } from '@kora/contracts';
import { SupportPlanNotFoundError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { TICKET_CLIENT_READER, type TicketClientReader, type TicketClientContactReference } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { TICKET_USER_READER, type TicketUserReader } from '../ports/ticket-user-reader.port';
import { computeSupportPlanAlerts } from '../services/support-plan-alerts';
import { SupportPlanCurrentBillingResolver } from '../services/support-plan-current-billing.resolver';
import { resolveSupportPlanName } from '../services/support-plan-naming';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { UseCase } from '../../../../shared/application/use-case';
import { paymentStatusOf } from '../services/support-invoice-payment-status';

export interface GetSupportPlanQuery {
  readonly planId: string;
}

/** Ficha completa del contrato de soporte — identidad, contacto, SLA, proyectos cubiertos, resumen de consumo, e historial de facturas. */
@Injectable()
export class GetSupportPlanUseCase implements UseCase<GetSupportPlanQuery, SupportPlanWithInvoices, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(TICKET_USER_READER) private readonly users: TicketUserReader,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    private readonly currentBilling: SupportPlanCurrentBillingResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetSupportPlanQuery): Promise<Result<SupportPlanWithInvoices, ApplicationError>> {
    const plan = await this.plans.findById(query.planId);
    if (!plan) return err(new SupportPlanNotFoundError(query.planId));
    const record = plan.toSnapshot() as SupportPlanRecord;
    const now = this.clock.now();

    const linkedIds = await this.summaryBuilder.resolveLinkedProjectIds(record);

    const [client, linkedProjects, leader, periods, invoiceRows, contact, current, summary] = await Promise.all([
      this.clients.findById(record.clientId),
      this.projects.findManyByIds(linkedIds),
      record.leaderUserId ? this.users.findById(record.leaderUserId) : Promise.resolve(null),
      this.plans.listPeriodsForPlan(record.id),
      this.invoices.listForPlan(record.id),
      this.resolveContact(record),
      this.currentBilling.resolve(record, linkedIds, now),
      this.summaryBuilder.build(record, linkedIds, now),
    ]);

    const alerts = computeSupportPlanAlerts(record, periods, summary.usedHours, now);

    return ok({
      id: record.id,
      name: resolveSupportPlanName(record.name, record.scope, linkedProjects.map((p) => p.name), client?.companyName ?? ''),
      scope: record.scope,
      planType: record.planType,
      surplusPolicy: record.surplusPolicy,
      status: record.status,
      leaderName: leader?.fullName ?? null,
      startDate: toIsoDate(record.startDate),
      endDate: record.endDate ? toIsoDate(record.endDate) : null,
      dueDayOfMonth: record.dueDayOfMonth,
      contractedHours: record.contractedHours,
      usedHours: summary.usedHours,
      planValueUf: record.planValueUf,
      currency: record.currency,
      currentBillingStatus: current.billingStatus,
      currentAmountUf: current.amountUf,
      alerts,
      clientId: record.clientId,
      clientName: client?.companyName ?? '',
      extraHourValueUf: record.extraHourValueUf,
      leaderUserId: record.leaderUserId,
      contact,
      quotationLink: record.quotationLink,
      contractLink: record.contractLink,
      additionalLinks: record.additionalLinks,
      targetHours: {
        critical: record.targetHoursCritical,
        high: record.targetHoursHigh,
        medium: record.targetHoursMedium,
        low: record.targetHoursLow,
      },
      linkedProjects: linkedProjects.map((project) => ({ id: project.id, name: project.name, status: project.status })),
      closedAt: record.closedAt ? toIsoDate(record.closedAt) : null,
      closeReason: record.closeReason,
      summary,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      invoices: invoiceRows.map((invoice) => ({
        id: invoice.id,
        planId: invoice.planId,
        periodKey: invoice.periodKey,
        amountUf: invoice.amountUf,
        currency: invoice.currency,
        hoursBilled: invoice.hoursBilled,
        folio: invoice.folio,
        invoicedAt: toIsoDate(invoice.invoicedAt),
        dueAt: invoice.dueAt ? toIsoDate(invoice.dueAt) : null,
        paidAt: invoice.paidAt ? toIsoDate(invoice.paidAt) : null,
        attachmentName: invoice.attachmentName,
        paymentStatus: paymentStatusOf(invoice, now),
      })),
    });
  }

  private async resolveContact(record: SupportPlanRecord): Promise<(TicketClientContactReference & { isClientDefault: boolean }) | null> {
    if (record.primaryContactId) {
      const contact = await this.clients.findContact(record.clientId, record.primaryContactId);
      return contact ? { ...contact, isClientDefault: false } : null;
    }
    const client = await this.clients.findById(record.clientId);
    return client?.primaryContact ? { ...client.primaryContact, isClientDefault: true } : null;
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
