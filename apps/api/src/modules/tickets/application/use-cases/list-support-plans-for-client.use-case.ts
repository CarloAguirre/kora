import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { SupportPlanListItem } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { TICKET_USER_READER, type TicketUserReader } from '../ports/ticket-user-reader.port';
import { computeSupportPlanAlerts } from '../services/support-plan-alerts';
import { SupportMonthlyPeriodReconciler } from '../services/support-monthly-period-reconciler';
import { SupportPlanCurrentBillingResolver } from '../services/support-plan-current-billing.resolver';
import { resolveSupportPlanName } from '../services/support-plan-naming';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListSupportPlansForClientQuery {
  readonly clientId: string;
}

/** Alimenta la tabla "Contratos" de la ficha de cliente. */
@Injectable()
export class ListSupportPlansForClientUseCase
  implements UseCase<ListSupportPlansForClientQuery, SupportPlanListItem[], ApplicationError>
{
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(TICKET_USER_READER) private readonly users: TicketUserReader,
    private readonly currentBilling: SupportPlanCurrentBillingResolver,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    private readonly periods: SupportMonthlyPeriodReconciler,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: ListSupportPlansForClientQuery): Promise<Result<SupportPlanListItem[], ApplicationError>> {
    const now = this.clock.now();
    const client = await this.clients.findById(query.clientId);
    const records = client ? await this.plans.listForClient(client.id) : [];

    const items = await Promise.all(records.map((record) => this.toListItem(record, client?.companyName ?? '', now)));
    return ok(items);
  }

  private async toListItem(record: SupportPlanRecord, clientName: string, now: Date): Promise<SupportPlanListItem> {
    const linkedIds = await this.summaryBuilder.resolveLinkedProjectIds(record);
    const periods = await this.periods.listPeriods(record, now);

    const [leader, summary, current, linkedProjects] = await Promise.all([
      record.leaderUserId ? this.users.findById(record.leaderUserId) : Promise.resolve(null),
      this.summaryBuilder.build(record, linkedIds, now),
      this.currentBilling.resolve(record, linkedIds, now),
      // Migrados por el ETL antes de que `name` existiera como columna — sin este fallback, la tabla mostraría el nombre en blanco para los 30 contratos legados.
      record.name ? Promise.resolve([]) : this.projects.findManyByIds(linkedIds),
    ]);

    const alerts = computeSupportPlanAlerts(record, periods, summary.usedHours, now);

    return {
      id: record.id,
      slug: record.slug,
      projectId: record.projectId,
      name: resolveSupportPlanName(record.name, record.scope, linkedProjects.map((p) => p.name), clientName),
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
    };
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
