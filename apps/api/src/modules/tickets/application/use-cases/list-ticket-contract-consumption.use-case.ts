import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type Clock, type Result } from '@kora/core';
import type { TicketContractConsumption, TicketContractConsumptionResponse, TicketContractHourEntry } from '@kora/contracts';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { SUPPORT_CONSUMPTION_READER, type SupportConsumptionReader } from '../ports/support-consumption-reader.port';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { UseCase } from '../../../../shared/application/use-case';
import { resolveTicketFilters, type ListTicketsQueryCommand } from './list-tickets.use-case';

/**
 * Para que el total del Excel del historial cuadre con el del contrato de
 * soporte: por cada contrato de los tickets del filtro, su total en Kora
 * (`SupportPlanSummaryBuilder`, la cifra de la ficha) y los registros de horas
 * que consume sin pasar por un ticket (cargados directo al proyecto de
 * soporte). Muestra horas de todo el contrato, no
 * solo las propias: exige `tickets:read` (alcance completo).
 */
@Injectable()
export class ListTicketContractConsumptionUseCase
  implements UseCase<ListTicketsQueryCommand, TicketContractConsumptionResponse, never>
{
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_CONSUMPTION_READER) private readonly consumption: SupportConsumptionReader,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ListTicketsQueryCommand): Promise<Result<TicketContractConsumptionResponse, never>> {
    const empty = { contracts: [], entries: [] };
    if (!command.actorPermissions.includes('tickets:read')) return ok(empty);
    const filters = await resolveTicketFilters(command, this.projects);
    if (!filters) return ok(empty);

    const plans = new Map<string, SupportPlanRecord>();
    for (const projectId of await this.tickets.listProjectIds(filters)) {
      const plan = await this.plans.findActiveForProjectOrLinked(projectId);
      if (plan) plans.set(plan.id, plan);
    }

    const now = this.clock.now();
    const { workedFrom, workedTo } = command.query;
    const contracts: TicketContractConsumption[] = [];
    const entries: TicketContractHourEntry[] = [];
    for (const plan of plans.values()) {
      const projectIds = await this.summaryBuilder.resolveLinkedProjectIds(plan);
      // Con filtro de fecha trabajada, los registros sin ticket también se acotan a esos días (dentro de la vigencia).
      const from = latest(plan.startDate, workedFrom ? utcDay(workedFrom) : null)!;
      const to = earliest(plan.endDate, workedTo ? utcDay(workedTo) : null);
      const [summary, withoutTicket, container] = await Promise.all([
        this.summaryBuilder.build(plan, projectIds, now),
        this.consumption.listEntriesWithoutTicket(projectIds, from, to),
        plan.projectId ? this.projects.findById(plan.projectId) : Promise.resolve(null),
      ]);
      contracts.push({
        planId: plan.id,
        name: plan.name ?? container?.name ?? 'Contrato de soporte',
        projectIds,
        startDate: isoDay(plan.startDate),
        endDate: plan.endDate ? isoDay(plan.endDate) : null,
        usedHours: Math.round(summary.usedHours * 100) / 100,
      });
      for (const entry of withoutTicket) {
        entries.push({
          planId: plan.id,
          date: entry.date,
          hours: entry.hours,
          projectName: entry.projectName,
          userFullName: entry.userFullName,
          category: entry.category,
          description: entry.description,
          source: entry.fromDeletedTicket ? 'deleted_ticket' : entry.projectId === plan.projectId ? 'without_ticket' : 'linked_project',
        });
      }
    }

    return ok({ contracts, entries });
  }
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return a ?? b;
  return a > b ? a : b;
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return a ?? b;
  return a < b ? a : b;
}
