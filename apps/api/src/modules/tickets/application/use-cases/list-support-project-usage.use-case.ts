import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type Clock, type Result } from '@kora/core';
import type { Permission, SupportProjectSummary, SupportProjectUsage } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportPlanRecord,
  type SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListSupportProjectUsageCommand {
  readonly projectIds: readonly string[];
  readonly actorUserId: string;
  readonly actorPermissions: readonly Permission[];
}

/** Cada resumen lanza varias consultas (y puede reconciliar períodos): se arma de a pocos para no agotar el pool. */
const CHUNK_SIZE = 10;

/**
 * Columnas de horas de la tabla de Soporte. Antes salían de
 * `projects.sold_hours`/`used_hours`, que no conocen el contrato: un plan
 * mensual comparaba las HH de UN mes contra todo lo consumido en la historia
 * (p. ej. 50 h vs. 747 h → 697 h "desviadas") y una bolsa sumaba horas
 * anteriores al inicio del contrato. Aquí se usa el mismo
 * `SupportPlanSummaryBuilder` que "Estado del proyecto" de la ficha.
 *
 * Proyectos sin contrato activo (o a los que el actor no tiene acceso) no
 * vienen en la respuesta; la tabla cae a los datos del listado.
 */
@Injectable()
export class ListSupportProjectUsageUseCase implements UseCase<ListSupportProjectUsageCommand, SupportProjectUsage[]> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ListSupportProjectUsageCommand): Promise<Result<SupportProjectUsage[]>> {
    const now = this.clock.now();
    const hasFullRead = command.actorPermissions.includes('projects:read');
    const projectIds = [...new Set(command.projectIds)];
    const usages: SupportProjectUsage[] = [];

    for (let index = 0; index < projectIds.length; index += CHUNK_SIZE) {
      const chunk = projectIds.slice(index, index + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map(async (projectId) => {
          if (!hasFullRead && !(await this.projects.isParticipant(projectId, command.actorUserId))) return null;
          const plan = await this.plans.findActiveForProjectOrLinked(projectId);
          if (!plan) return null;
          const linkedProjectIds = await this.summaryBuilder.resolveLinkedProjectIds(plan);
          const [summary, bundleMonthUsed] = await Promise.all([
            this.summaryBuilder.build(plan, linkedProjectIds, now),
            plan.planType === 'bundle' ? this.bundleMonthUsedHours(plan, linkedProjectIds, now) : Promise.resolve(null),
          ]);
          return toUsage(projectId, summary, bundleMonthUsed);
        }),
      );
      for (const usage of results) if (usage) usages.push(usage);
    }

    return ok(usages);
  }

  /**
   * Bolsa: el resumen de la ficha no separa el mes en curso, así que se suma aparte — acotado a la
   * vigencia del contrato, igual que el total.
   */
  private async bundleMonthUsedHours(plan: SupportPlanRecord, linkedProjectIds: readonly string[], now: Date): Promise<number> {
    if (linkedProjectIds.length === 0) return 0;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const from = plan.startDate > monthStart ? plan.startDate : monthStart;
    const to = plan.endDate && plan.endDate < monthLastDay ? plan.endDate : monthLastDay;
    if (from > to) return 0;
    return round2(await this.hourEntries.sumApprovedHoursForProjects(linkedProjectIds, from, to));
  }
}

function toUsage(projectId: string, summary: SupportProjectSummary, bundleMonthUsed: number | null): SupportProjectUsage {
  const { planType, currentPeriod } = summary;
  // Desglose mes / total: solo mensual y bolsa — "a demanda" no tiene tope ni ciclo contra qué leerlo.
  const contractUsedHours = planType === 'on_demand' ? null : round2(summary.usedHours);

  if (planType === 'monthly' && currentPeriod) {
    return {
      projectId,
      planType,
      scope: 'month',
      planHours: currentPeriod.planHours,
      priorSurplusHours: currentPeriod.priorSurplusHours,
      usedHours: currentPeriod.usedHours,
      remainingHours: currentPeriod.remainingHours,
      deviationHours: round2(Math.max(currentPeriod.usedHours - currentPeriod.capacityHours, 0)),
      monthUsedHours: currentPeriod.usedHours,
      contractUsedHours,
    };
  }

  // Mensual sin período vigente: no hay un mes con qué comparar — se muestra el consumo total del contrato.
  const hasCap = planType === 'bundle';
  return {
    projectId,
    planType,
    scope: 'contract',
    planHours: planType === 'on_demand' ? null : summary.contractedHours,
    priorSurplusHours: 0,
    usedHours: summary.usedHours,
    remainingHours: hasCap ? round2(Math.max(summary.contractedHours - summary.usedHours, 0)) : null,
    deviationHours: hasCap ? round2(Math.max(summary.usedHours - summary.contractedHours, 0)) : null,
    monthUsedHours: planType === 'bundle' ? bundleMonthUsed : null,
    contractUsedHours,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
