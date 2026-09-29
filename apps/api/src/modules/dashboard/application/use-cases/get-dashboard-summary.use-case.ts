import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import {
  PROJECT_PHASE_LABELS,
  PROJECT_SALES_STAGE_LABELS,
  type DashboardApprovalsTeam,
  type DashboardCapacityTeam,
  type DashboardCriticalProject,
  type DashboardOldestOpenTicket,
  type DashboardSummary,
  type DashboardSupportClient,
  type DashboardTicketStatusCount,
  type Permission,
  type RoleCode,
} from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_TEAM_READER, type HourEntryTeamReader } from '../../../hours/application/ports/hour-entry-team-reader.port';
import { TICKET_REPOSITORY, type TicketRepository, type TicketListItem } from '../../../tickets/domain/repositories/ticket.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectListItem,
  type ProjectRepository,
} from '../../../projects/domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../../projects/domain/repositories/project-module.repository';
import { ForecastCapacityService } from '../../../forecast/application/services/forecast-capacity.service';
import { TEAM_REPOSITORY, type TeamRepository } from '../../../teams/domain/repositories/team.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface GetDashboardSummaryCommand {
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
  readonly actorPermissions: readonly Permission[];
  /** Fecha (cualquier día) de la semana de capacidad a mostrar. Por defecto, la semana actual. */
  readonly weekStartIso?: string | undefined;
}

const WEEK_TARGET_HOURS = 40;
/** "Terminado" ya no cuenta como trabajo abierto: el ticket está resuelto, solo falta el cierre administrativo. */
const OPEN_TICKET_STATUSES = ['pending', 'in_progress', 'in_testing'] as const;
const PROJECT_PAGE_SIZE = 2000;
const PENDING_APPROVALS_PAGE_SIZE = 1000;
/** Igual que `PLANNING_HH_CONCEPTS` en la v1 (`src/utils/hhConcepts.ts`): categorías de registro_hh que cuentan como "HH Planificación", no consumo. */
const PLANNING_HH_CATEGORIES = new Set(['Apoyo Interno', 'Otros']);
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Un solo payload agregado — ver docs/DECISION-M7-DASHBOARD.md. Cada sección
 * consulta directamente el repositorio (o puerto) del módulo dueño de ese
 * dato, nunca su caso de uso: encadenar casos de uso está prohibido
 * (`architecture.spec.ts`, "ningún caso de uso importa otro caso de uso")
 * porque los vuelve dependientes entre sí. La agregación de forecast
 * reutiliza `ForecastCapacityService` (un servicio de aplicación, no un
 * caso de uso) por el mismo motivo.
 */
@Injectable()
export class GetDashboardSummaryUseCase implements UseCase<GetDashboardSummaryCommand, DashboardSummary, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(HOUR_ENTRY_TEAM_READER) private readonly hourEntryTeams: HourEntryTeamReader,
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly projectModules: ProjectModuleRepository,
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    private readonly forecastCapacity: ForecastCapacityService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GetDashboardSummaryCommand): Promise<Result<DashboardSummary, ApplicationError>> {
    const { actor, actorRole, actorPermissions, weekStartIso } = command;
    const now = this.clock.now();
    const weekStartOverride = weekStartIso ? parseIsoDate(weekStartIso) : undefined;

    const canReadTickets = actorPermissions.includes('tickets:read') || actorPermissions.includes('tickets:read_assigned');
    const canReadProjects = actorPermissions.includes('projects:read') || actorPermissions.includes('projects:read_assigned');

    const hasOwnHours = actorPermissions.includes('hours:read_own');

    const [hours, approvals, tickets, projects, capacity, support, myActiveProjects, planning, myTasks, myDeliveries] =
      await Promise.all([
        hasOwnHours ? this.buildHoursSummary(actor, now) : Promise.resolve(null),
        actorPermissions.includes('hours:approve') ? this.buildApprovalsSummary(actor, actorPermissions) : Promise.resolve(null),
        canReadTickets ? this.buildTicketsSummary(actor, actorPermissions) : Promise.resolve(null),
        canReadProjects ? this.buildProjectsSummary(actor, actorPermissions, now) : Promise.resolve(null),
        actorPermissions.includes('forecast:read') ? this.buildCapacitySummary(actor, weekStartOverride) : Promise.resolve(null),
        actorPermissions.includes('billing:read') ? this.buildSupportSummary(actor, actorRole) : Promise.resolve(null),
        hasOwnHours ? this.buildMyActiveProjects(actor) : Promise.resolve([]),
        hasOwnHours ? this.buildMyPlanning(actor, weekStartOverride) : Promise.resolve(null),
        hasOwnHours ? this.buildMyTasks(actor) : Promise.resolve([]),
        hasOwnHours ? this.buildMyDeliveries(actor) : Promise.resolve([]),
      ]);

    return ok({ hours, approvals, tickets, projects, capacity, support, myActiveProjects, planning, myTasks, myDeliveries });
  }

  /** "Mis tareas" — tareas de "Fases · Módulos" asignadas directamente al actor, en cualquier proyecto. */
  private async buildMyTasks(actor: ActorContext) {
    const rows = await this.projectModules.listTasksAssignedToUser(actor.userId);
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      moduleId: row.moduleId,
      moduleName: row.moduleName,
      title: row.name,
      date: toIsoDate(row.date),
      status: row.status,
      completedAt: row.completedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
    }));
  }

  /** "Mis entregas" — entregas de "Fases · Módulos" asignadas directamente al actor. */
  private async buildMyDeliveries(actor: ActorContext) {
    const rows = await this.projectModules.listDeliveriesAssignedToUser(actor.userId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      projectId: row.projectId,
      projectName: row.projectName,
      moduleId: row.moduleId,
      moduleName: row.moduleName,
      estimatedDate: toIsoDate(row.estimatedDate),
      status: row.status,
      rejectionReason: row.rejectionReason,
    }));
  }

  /**
   * Proyectos activos del actor — personal e incondicional (no exige
   * `projects:read`/`projects:read_assigned`), igual que `hours`. Alimenta el
   * panel "Proyectos de la Semana" de `MyActivityPanel` sin depender de un
   * permiso que roles como `collaborator` pueden no tener.
   */
  private async buildMyActiveProjects(actor: ActorContext) {
    const page = await this.projects.search(
      { assignedToUserId: actor.userId, status: ['active'] },
      { page: 1, pageSize: 10 },
      { field: 'name', direction: 'asc' },
    );
    return page.items.map((p) => ({ id: p.id, name: p.name }));
  }

  /**
   * "Mi Planificación" — reemplaza "Planificación Semanal" + "Mi Equipo" de la
   * v1. Reutiliza `ForecastCapacityService`, la misma agregación que ya ve el
   * líder en `/forecast`, ubicando la fila del propio actor por `userId` — sin
   * exigirle `forecast:read` (rol que `collaborator` no tiene).
   */
  private async buildMyPlanning(actor: ActorContext, weekStartOverride: Date | undefined) {
    const monday = mondayOf(weekStartOverride ?? this.clock.now());
    const friday = new Date(monday);
    friday.setUTCDate(friday.getUTCDate() + 4);

    const members = await this.forecastCapacity.getCapacitySummaryWithUserIds(monday, friday);
    const own = members.find((member) => member.userId === actor.userId);
    if (!own) return null;

    const toItems = (member: (typeof members)[number]) =>
      member.items.map((item) => ({ type: item.type, projectName: item.projectName, hours: item.hours }));

    const teamMembers = members
      .filter((member) => member.teamId === own.teamId && member.teamMemberId !== own.teamMemberId)
      .map((member) => ({ fullName: member.fullName, items: toItems(member), totalHours: member.assignedHours }));

    return {
      weekStart: toIsoDate(monday),
      items: toItems(own),
      totalHours: own.assignedHours,
      teamName: own.teamName,
      teamMembers,
    };
  }

  private async buildHoursSummary(actor: ActorContext, now: Date) {
    const monday = mondayOf(now);
    const todayIso = toIsoDate(now);

    const [weekPage, rejectedPage] = await Promise.all([
      this.hourEntries.search(
        { userId: actor.userId, dateFrom: monday, dateTo: now },
        { page: 1, pageSize: 200 },
        { field: 'date', direction: 'asc' },
      ),
      this.hourEntries.search(
        { userId: actor.userId, status: 'rejected' },
        { page: 1, pageSize: 1 },
        { field: 'date', direction: 'desc' },
      ),
    ]);

    const weekHours = weekPage.items.reduce((sum, entry) => sum + entry.hours, 0);
    const todayHours = weekPage.items
      .filter((entry) => toIsoDate(entry.date) === todayIso)
      .reduce((sum, entry) => sum + entry.hours, 0);

    return { todayHours, weekHours, weekTargetHours: WEEK_TARGET_HOURS, rejectedCount: rejectedPage.total };
  }

  private async buildApprovalsSummary(actor: ActorContext, actorPermissions: readonly Permission[]) {
    let visibleToUserIds: readonly string[] | undefined;
    if (actorPermissions.includes('hours:read_all')) {
      visibleToUserIds = undefined;
    } else if (actorPermissions.includes('hours:read_team')) {
      const teamMemberIds = await this.hourEntryTeams.findTeamMemberUserIds(actor.userId);
      visibleToUserIds = [actor.userId, ...teamMemberIds];
    } else {
      visibleToUserIds = [actor.userId];
    }

    const page = await this.hourEntries.search(
      { status: 'pending', visibleToUserIds },
      { page: 1, pageSize: PENDING_APPROVALS_PAGE_SIZE },
      { field: 'date', direction: 'desc' },
    );

    const byTeamMap = new Map<string, DashboardApprovalsTeam>();
    for (const entry of page.items) {
      const key = entry.teamId ?? 'none';
      const existing = byTeamMap.get(key);
      byTeamMap.set(key, {
        teamId: entry.teamId,
        teamName: entry.teamName,
        pendingCount: (existing?.pendingCount ?? 0) + 1,
      });
    }
    const pendingByTeam = [...byTeamMap.values()].sort((a, b) => b.pendingCount - a.pendingCount);

    return { pendingCount: page.total, pendingByTeam };
  }

  private async buildTicketsSummary(actor: ActorContext, actorPermissions: readonly Permission[]) {
    const hasFullRead = actorPermissions.includes('tickets:read');
    const assigneeUserId = hasFullRead ? undefined : [actor.userId];
    const pages = await Promise.all(
      OPEN_TICKET_STATUSES.map((status) =>
        this.tickets.search({ status, assigneeUserId }, { page: 1, pageSize: 1 }, { field: 'createdAt', direction: 'asc' }),
      ),
    );

    const byStatus: DashboardTicketStatusCount[] = OPEN_TICKET_STATUSES.map((status, index) => ({
      status,
      count: pages[index]!.total,
    })).filter((entry) => entry.count > 0);

    const oldestCandidates = pages.map((page) => page.items[0]).filter((item): item is TicketListItem => item != null);
    const oldest =
      oldestCandidates.length > 0
        ? oldestCandidates.reduce((min, item) => (item.createdAt < min.createdAt ? item : min))
        : null;
    const oldestOpenTicket: DashboardOldestOpenTicket | null = oldest
      ? {
          id: oldest.id,
          title: oldest.title,
          status: oldest.status,
          createdAt: oldest.createdAt.toISOString(),
          clientName: oldest.clientName,
          assigneeName: oldest.assigneeName,
        }
      : null;

    return {
      openCount: pages.reduce((sum, page) => sum + page.total, 0),
      byStatus,
      oldestOpenTicket,
      scope: hasFullRead ? ('all' as const) : ('own' as const),
    };
  }

  private async buildProjectsSummary(actor: ActorContext, actorPermissions: readonly Permission[], now: Date) {
    const hasFullRead = actorPermissions.includes('projects:read');
    const page = await this.projects.search(
      { type: 'development', assignedToUserId: hasFullRead ? undefined : actor.userId },
      { page: 1, pageSize: PROJECT_PAGE_SIZE },
      { field: 'name', direction: 'asc' },
    );
    const items = page.items;
    const active = items.filter((p) => p.status === 'active');

    const deviationAlertsCount = active.filter((p) => p.usedHours > p.soldHours).length;
    const deviationHoursTotal = active.reduce((sum, p) => sum + Math.max(0, p.usedHours - p.soldHours), 0);

    const prospectCount = items.filter((p) => p.salesStage === 'prospect').length;
    const quotationCount = items.filter((p) => p.salesStage === 'quoted').length;
    const finishedCount = items.filter((p) => p.status === 'finished').length;

    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const closingThisMonthCount = active.filter(
      (p) => p.endDate != null && p.endDate <= endOfMonth && p.endDate >= now,
    ).length;

    const allScored = active.map((p) => {
      const consumptionPercent = p.soldHours > 0 ? Math.round((p.usedHours / p.soldHours) * 100) : 0;
      const actualProgress = p.actualProgress != null ? clampPct(p.actualProgress) : Math.max(0, consumptionPercent);
      const expectedProgress = calculateExpectedProgress(p.startDate, p.endDate, now);
      const lag = expectedProgress - actualProgress;
      const hasOperationalData = p.usedHours > 0 || actualProgress > 0;

      let status: 'critical' | 'alert' | 'optimal' = 'optimal';
      if (consumptionPercent >= 90 || (hasOperationalData && lag >= 20)) status = 'critical';
      else if (consumptionPercent >= 70 || (hasOperationalData && lag >= 10)) status = 'alert';

      return { p, actualProgress, expectedProgress, status };
    });

    const healthBreakdown = {
      critical: allScored.filter((entry) => entry.status === 'critical').length,
      alert: allScored.filter((entry) => entry.status === 'alert').length,
      optimal: allScored.filter((entry) => entry.status === 'optimal').length,
    };

    const scored = allScored
      .filter((entry) => entry.status !== 'optimal')
      .sort((a, b) => {
        const priorityDiff = priorityRank(b.p.priority) - priorityRank(a.p.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return b.p.soldHours - a.p.soldHours;
      })
      .slice(0, 4);

    const planningHoursByProject = await this.loadPlanningHours(scored.map((entry) => entry.p.id));

    const criticalProjects: DashboardCriticalProject[] = scored.map((entry) => ({
      id: entry.p.id,
      name: entry.p.name,
      leaderFullName: entry.p.leaderName,
      priority: (entry.p.priority as DashboardCriticalProject['priority']) ?? null,
      usedHours: entry.p.usedHours,
      soldHours: entry.p.soldHours,
      planningHours: planningHoursByProject.get(entry.p.id) ?? 0,
      actualProgress: entry.actualProgress,
      expectedProgress: entry.expectedProgress,
      status: entry.status as 'critical' | 'alert',
      stageLabel: developmentStageLabel(entry.p),
    }));

    return {
      activeCount: active.length,
      deviationAlertsCount,
      deviationHoursTotal,
      prospectCount,
      quotationCount,
      finishedCount,
      closingThisMonthCount,
      healthBreakdown,
      criticalProjects,
      scope: hasFullRead ? ('all' as const) : ('own' as const),
    };
  }

  private async loadPlanningHours(projectIds: readonly string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (projectIds.length === 0) return result;

    const pages = await Promise.all(
      projectIds.map((projectId) =>
        this.hourEntries.search(
          { projectId, status: 'approved' },
          { page: 1, pageSize: 500 },
          { field: 'date', direction: 'desc' },
        ),
      ),
    );

    pages.forEach((page, index) => {
      const total = page.items
        .filter((entry) => PLANNING_HH_CATEGORIES.has(entry.category.trim()))
        .reduce((sum, entry) => sum + entry.hours, 0);
      result.set(projectIds[index]!, total);
    });

    return result;
  }

  private async buildCapacitySummary(actor: ActorContext, weekStartOverride: Date | undefined) {
    const monday = mondayOf(weekStartOverride ?? this.clock.now());
    const friday = new Date(monday);
    friday.setUTCDate(friday.getUTCDate() + 4);

    const [ledTeams, allMembers] = await Promise.all([
      this.teams.search({ leaderUserId: actor.userId }, { page: 1, pageSize: 50 }, { field: 'name', direction: 'asc' }),
      this.forecastCapacity.getCapacitySummary(monday, friday),
    ]);

    const ledTeamIds = new Set(ledTeams.items.map((team) => team.id));
    const scoped = ledTeamIds.size > 0 ? allMembers.filter((member) => ledTeamIds.has(member.teamId)) : allMembers;

    const totalCapacity = scoped.reduce((sum, member) => sum + member.capacityHours, 0);
    const totalAssigned = scoped.reduce((sum, member) => sum + member.assignedHours, 0);
    const averageLoadPercent = totalCapacity > 0 ? Math.round((totalAssigned / totalCapacity) * 100) : 0;

    const scopeLabel =
      ledTeamIds.size === 1 ? (ledTeams.items[0]?.name ?? 'Tu equipo') : ledTeamIds.size > 1 ? 'Tus equipos' : 'Toda la organización';

    const byTeamMap = new Map<string, DashboardCapacityTeam>();
    for (const member of allMembers) {
      const existing = byTeamMap.get(member.teamId);
      if (existing) {
        byTeamMap.set(member.teamId, {
          ...existing,
          capacityHours: existing.capacityHours + member.capacityHours,
          assignedHours: existing.assignedHours + member.assignedHours,
        });
      } else {
        byTeamMap.set(member.teamId, {
          teamId: member.teamId,
          teamName: member.teamName,
          capacityHours: member.capacityHours,
          assignedHours: member.assignedHours,
          freeHours: 0,
        });
      }
    }
    const byTeam = [...byTeamMap.values()]
      .filter((team) => team.capacityHours > 0)
      .map((team) => {
        const capacityHours = Math.round(team.capacityHours);
        const assignedHours = Math.round(team.assignedHours);
        return { ...team, capacityHours, assignedHours, freeHours: Math.max(0, capacityHours - assignedHours) };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));

    return { averageLoadPercent, memberCount: scoped.length, scopeLabel, weekStart: toIsoDate(monday), byTeam };
  }

  private async buildSupportSummary(actor: ActorContext, actorRole: RoleCode) {
    const scopedToLeader = actorRole === 'leader';
    const page = await this.projects.search(
      { type: 'support', leaderUserId: scopedToLeader ? [actor.userId] : undefined },
      { page: 1, pageSize: PROJECT_PAGE_SIZE },
      { field: 'name', direction: 'asc' },
    );

    const rows = page.items.map((p) => {
      const contractedHours = isMonthlySupportPlan(p.supportPlanDescription) ? p.soldHours : p.supportHours || p.soldHours;
      const usedHours = p.usedHours;
      return {
        client: p.clientName ?? 'Sin cliente',
        contractedHours,
        usedHours,
        deviation: Math.max(0, usedHours - contractedHours),
        startDate: p.startDate,
        endDate: p.endDate,
      };
    });

    const soldHours = rows.reduce((sum, row) => sum + row.contractedHours, 0);
    const usedHours = rows.reduce((sum, row) => sum + row.usedHours, 0);
    const deviationHours = rows.reduce((sum, row) => sum + row.deviation, 0);

    const byClient = new Map<string, { usedHours: number; soldHours: number }>();
    for (const row of rows) {
      const existing = byClient.get(row.client) ?? { usedHours: 0, soldHours: 0 };
      byClient.set(row.client, {
        usedHours: existing.usedHours + row.usedHours,
        soldHours: existing.soldHours + row.contractedHours,
      });
    }

    const topClients: DashboardSupportClient[] = [...byClient.entries()]
      .sort((a, b) => b[1].usedHours - a[1].usedHours)
      .slice(0, 5)
      .map(([name, data]) => ({
        name,
        usedHours: data.usedHours,
        soldHours: data.soldHours,
        percent: data.soldHours > 0 ? Math.round((data.usedHours / data.soldHours) * 100) : 0,
      }));

    return {
      projectsWithSupportCount: rows.length,
      soldHours,
      usedHours,
      deviationHours,
      usedPercent: soldHours > 0 ? Math.round((usedHours / soldHours) * 100) : 0,
      deviationPercent: soldHours > 0 ? Math.round((deviationHours / soldHours) * 100) : 0,
      topClients,
      trend: this.buildSupportTrend(rows, this.clock.now()),
      scope: scopedToLeader ? ('own' as const) : ('all' as const),
    };
  }

  /**
   * Serie mensual real (no sintética, a diferencia de la v1 — ver
   * docs/DECISION-M7-DASHBOARD.md) de los últimos 12 meses: las horas de cada
   * proyecto de soporte se prorratean entre los meses de la ventana que su
   * rango `[startDate, endDate]` cubre (sin fecha de fin = sigue vigente
   * hasta el mes actual).
   */
  private buildSupportTrend(
    rows: readonly { usedHours: number; contractedHours: number; startDate: Date | null; endDate: Date | null }[],
    now: Date,
  ) {
    const months = Array.from({ length: 12 }, (_, index) => {
      const offset = 11 - index;
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    });

    const totals = months.map(() => ({ usedHours: 0, contractedHours: 0 }));

    for (const row of rows) {
      const overlappingIndexes: number[] = [];
      months.forEach((monthStart, index) => {
        const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
        const rowStart = row.startDate ?? monthStart;
        const rowEnd = row.endDate ?? now;
        if (rowStart <= monthEnd && rowEnd >= monthStart) overlappingIndexes.push(index);
      });
      if (overlappingIndexes.length === 0) continue;

      const share = 1 / overlappingIndexes.length;
      for (const index of overlappingIndexes) {
        totals[index]!.usedHours += row.usedHours * share;
        totals[index]!.contractedHours += row.contractedHours * share;
      }
    }

    return months.map((monthStart, index) => ({
      month: MONTH_LABELS[monthStart.getUTCMonth()]!,
      usedHours: Math.round(totals[index]!.usedHours * 100) / 100,
      contractedHours: Math.round(totals[index]!.contractedHours * 100) / 100,
    }));
  }
}

function mondayOf(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateExpectedProgress(start: Date | null, end: Date | null, now: Date): number {
  if (!start || !end) return 0;
  if (end <= start) return now >= end ? 100 : 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return clampPct(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
}

function priorityRank(priority: string | null): number {
  return priority ? (PRIORITY_RANK[priority] ?? 0) : 0;
}

const DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function isMonthlySupportPlan(description: string | null): boolean {
  return (
    (description ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(DIACRITICS_PATTERN, '')
      .replace(/\s+/g, '')
      .trim() === 'mensual'
  );
}

function developmentStageLabel(p: ProjectListItem): string {
  if (p.status === 'finished') return 'Finalizado';
  if (p.status === 'cancelled') return 'Cancelado';
  if (p.status === 'on_hold') return 'Detenido';
  if (p.status === 'draft') return 'No iniciado';
  if (p.salesStage && p.salesStage !== 'approved') {
    return PROJECT_SALES_STAGE_LABELS[p.salesStage as keyof typeof PROJECT_SALES_STAGE_LABELS] ?? p.salesStage;
  }
  if (p.phase) return PROJECT_PHASE_LABELS[p.phase as keyof typeof PROJECT_PHASE_LABELS] ?? p.phase;
  return 'No Aplica';
}
