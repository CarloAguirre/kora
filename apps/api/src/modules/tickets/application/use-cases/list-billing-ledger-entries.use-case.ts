import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { BillingLedgerEntry, BillingLedgerResponse, SupportInvoicePaymentStatus, SupportPlanScope } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRecord, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../../projects/domain/repositories/project-payment-milestone.repository';
import { resolveSupportPlanName } from '../services/support-plan-naming';
import { paymentStatusOf } from '../services/support-invoice-payment-status';
import { SupportPlanCurrentBillingResolver } from '../services/support-plan-current-billing.resolver';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { UseCase } from '../../../../shared/application/use-case';

const PAYMENT_STATUS_TO_LEDGER_STATUS: Readonly<Record<SupportInvoicePaymentStatus, BillingLedgerEntry['status']>> = {
  pending: 'facturado',
  overdue: 'atrasado',
  paid: 'pagado',
};

/**
 * Libro combinado de Facturación (rol Finanzas): une Soporte y Proyectos en
 * una tabla plana. Soporte: el ciclo vigente que todavía no tiene factura
 * (mismo cálculo que usa `GetSupportBillingOverviewUseCase` —
 * `SupportPlanCurrentBillingResolver`, no el use-case: un use-case nunca
 * importa a otro, ver `architecture.spec.ts`) + TODO el historial real de
 * `support_invoices` (cualquier período, cualquier plan — si ya está
 * facturado, existe una fila ahí, sea del período que sea). Proyectos: todos
 * los `project_payment_milestones` de todos los proyectos.
 */
@Injectable()
export class ListBillingLedgerEntriesUseCase implements UseCase<void, BillingLedgerResponse, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    private readonly currentBilling: SupportPlanCurrentBillingResolver,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<BillingLedgerResponse, ApplicationError>> {
    const now = this.clock.now();
    const currentPeriod = periodKeyOf(now);

    const [pendingEntries, invoiceEntries, projectEntries] = await Promise.all([
      this.buildPendingSupportEntries(now, currentPeriod),
      this.buildSupportInvoiceEntries(now),
      this.buildProjectEntries(),
    ]);

    const entries = [...pendingEntries, ...invoiceEntries, ...projectEntries].sort((a, b) => {
      const dateA = a.issuedAt ?? '';
      const dateB = b.issuedAt ?? '';
      return dateB.localeCompare(dateA);
    });

    return ok({ entries });
  }

  /** Réplica del "período vigente" de `GetSupportBillingOverviewUseCase`, solo para las filas todavía SIN factura — ver el comentario de la clase. */
  private async buildPendingSupportEntries(now: Date, currentPeriod: string): Promise<BillingLedgerEntry[]> {
    const plans = await this.plans.listAllActive();
    if (plans.length === 0) return [];

    const clientIds = [...new Set(plans.map((plan) => plan.clientId))];
    const clientEntries = await Promise.all(clientIds.map(async (id) => [id, await this.clients.findById(id)] as const));
    const clientNameById = new Map(
      clientEntries
        .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null)
        .map(([id, client]) => [id, client.companyName] as const),
    );

    const entries: BillingLedgerEntry[] = [];
    for (const plan of plans) {
      const linkedIds = await this.summaryBuilder.resolveLinkedProjectIds(plan);
      const current = await this.currentBilling.resolve(plan, linkedIds, now);
      if (current.billingStatus !== 'to_invoice') continue;

      const clientName = clientNameById.get(plan.clientId) ?? '';
      entries.push({
        id: `pending-${plan.id}-${currentPeriod}`,
        line: 'soporte',
        clientId: plan.clientId,
        clientName,
        detail: resolveSupportPlanName(plan.name, plan.scope, [], clientName),
        amount: current.amountUf,
        currency: plan.currency,
        folio: null,
        issuedAt: null,
        status: 'pendiente',
        paidAt: null,
        referenceId: null,
        projectId: null,
        projectName: null,
        milestoneName: null,
        milestonePercent: null,
      });
    }
    return entries;
  }

  private async buildSupportInvoiceEntries(now: Date): Promise<BillingLedgerEntry[]> {
    const invoices = await this.invoices.listAll();
    if (invoices.length === 0) return [];

    const planIds = [...new Set(invoices.map((invoice) => invoice.planId))];
    const planEntries = await Promise.all(planIds.map((id) => this.plans.findById(id)));
    const planById = new Map(
      planEntries.filter((plan): plan is NonNullable<typeof plan> => plan !== null).map((plan) => [plan.id, plan.toSnapshot()]),
    );

    const clientIds = [...new Set([...planById.values()].map((plan) => plan.clientId))];
    const clientEntries = await Promise.all(clientIds.map(async (id) => [id, await this.clients.findById(id)] as const));
    const clientNameById = new Map(
      clientEntries
        .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null)
        .map(([id, client]) => [id, client.companyName] as const),
    );

    return invoices.map((invoice) => this.toInvoiceEntry(invoice, planById, clientNameById, now));
  }

  private toInvoiceEntry(
    invoice: SupportInvoiceRecord,
    planById: Map<string, { clientId: string; name: string | null; scope: SupportPlanScope }>,
    clientNameById: Map<string, string>,
    now: Date,
  ): BillingLedgerEntry {
    const plan = planById.get(invoice.planId);
    const clientId = plan?.clientId ?? '';
    const clientName = clientId ? (clientNameById.get(clientId) ?? '') : '';
    const detail = resolveSupportPlanName(plan?.name ?? null, plan?.scope ?? 'single', [], clientName);

    return {
      id: invoice.id,
      line: 'soporte',
      clientId,
      clientName,
      detail,
      amount: invoice.amountUf,
      currency: invoice.currency,
      folio: invoice.folio,
      issuedAt: invoice.invoicedAt.toISOString().slice(0, 10),
      status: PAYMENT_STATUS_TO_LEDGER_STATUS[paymentStatusOf(invoice, now)],
      paidAt: invoice.paidAt?.toISOString().slice(0, 10) ?? null,
      referenceId: invoice.id,
      projectId: null,
      projectName: null,
      milestoneName: null,
      milestonePercent: null,
    };
  }

  private async buildProjectEntries(): Promise<BillingLedgerEntry[]> {
    const milestones = await this.milestones.listAll();

    return milestones
      .filter((milestone) => milestone.clientId !== null)
      .map((milestone) => ({
        id: milestone.id,
        line: 'proyecto' as const,
        clientId: milestone.clientId as string,
        clientName: milestone.clientName ?? '',
        detail: `${milestone.projectName} — ${milestone.name}`,
        amount: milestone.amount,
        // `project_payment_milestones` todavía no tiene moneda propia — mismo criterio ya usado en `ProjectBillingCard.tsx` del portal cliente.
        currency: 'CLP' as const,
        folio: milestone.invoiceNumber,
        issuedAt: milestone.issuedAt?.toISOString().slice(0, 10) ?? null,
        status: milestone.status === 'pending' ? 'pendiente' : milestone.status === 'invoiced' ? 'facturado' : 'pagado',
        paidAt: milestone.paidAt?.toISOString().slice(0, 10) ?? null,
        referenceId: milestone.id,
        projectId: milestone.projectId,
        projectName: milestone.projectName,
        milestoneName: milestone.name,
        milestonePercent: milestone.percent,
      }));
  }
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
