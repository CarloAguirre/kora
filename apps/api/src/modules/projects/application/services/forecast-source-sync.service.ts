import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@kora/core';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRecord,
  type ProjectModuleRepository,
  type ProjectModuleSegmentMemberInput,
  type ProjectModuleTaskRecord,
} from '../../domain/repositories/project-module.repository';
import {
  FORECAST_SOURCE_STORE,
  type ForecastSourceStore,
  type ForecastSourceTarget,
  type ForecastSyncChange,
} from '../ports/forecast-source-store.port';
import {
  PROJECT_TEAM_MEMBER_VALIDATOR,
  type ProjectTeamMemberValidator,
} from '../ports/project-team-member-validator.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { planSegmentForecast, planTaskForecast, type DateRange, type PlannedForecastWeek } from './forecast-planner';

export interface ForecastSourceProject {
  readonly id: string;
  readonly clientId: string | null;
  readonly name: string;
}

const SYSTEM_ACTOR_NAMES = { segment: 'Sistema · Roadmap', task: 'Sistema · Tarea' } as const;

/**
 * Mantiene el Forecast al día con lo planificado en los proyectos — ver docs/DECISION-M6-FORECAST.md,
 * "Forecast calculado":
 *
 * - Tramos del Roadmap: `planSegmentForecast` con el % diario de cada colaborador.
 * - Tareas con responsable: `planTaskForecast`, sin contar los días que la persona ya tiene cubiertos
 *   por un tramo del mismo módulo. Por eso, al cambiar un tramo se recalculan también las tareas de su
 *   módulo.
 *
 * Nunca pisa un ajuste del líder: si el cálculo cambia sobre una fila ajustada, la deja desfasada para
 * que el líder decida (`ForecastSourceStore.syncSource`). Recalcula todas las semanas, pasadas incluidas.
 */
@Injectable()
export class ForecastSourceSyncService {
  constructor(
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(FORECAST_SOURCE_STORE) private readonly store: ForecastSourceStore,
    @Inject(PROJECT_TEAM_MEMBER_VALIDATOR) private readonly teamMembers: ProjectTeamMemberValidator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** ¿Todos son miembros activos de `teamId`? */
  async membersBelongToTeam(teamId: string, members: readonly ProjectModuleSegmentMemberInput[]): Promise<boolean> {
    const checks = await Promise.all(
      members.map(async (member) => {
        const [memberTeamId, active] = await Promise.all([
          this.teamMembers.findTeamId(member.teamMemberId),
          this.teamMembers.isActiveTeamMember(member.teamMemberId),
        ]);
        return memberTeamId === teamId && active;
      }),
    );
    return checks.every(Boolean);
  }

  /** Recalcula un tramo y, como cambia qué días quedan cubiertos, todas las tareas de su módulo. */
  async syncSegment(
    project: ForecastSourceProject,
    moduleId: string,
    segmentId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const module = await this.modules.findById(moduleId, context);
    const segment = module?.segments.find((s) => s.id === segmentId);
    if (!module || !segment) return;

    await this.syncSegmentOf(project, segment, now, context);
    await this.syncTasksOf(project, module, now, context);
  }

  async syncTask(
    project: ForecastSourceProject,
    moduleId: string,
    taskId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const module = await this.modules.findById(moduleId, context);
    const task = module?.tasks.find((t) => t.id === taskId);
    if (!module || !task) return;
    await this.syncTaskOf(project, module, task, now, context);
  }

  /** Tras borrar un tramo: sus filas se van en cascada, pero las tareas que cubría vuelven a sumar. */
  async syncModuleTasks(project: ForecastSourceProject, moduleId: string, now: Date, context?: TransactionContext): Promise<void> {
    const module = await this.modules.findById(moduleId, context);
    if (module) await this.syncTasksOf(project, module, now, context);
  }

  /**
   * HH semanales que cargaría un tramo con estos datos, sin guardar nada — para avisar sobrecargas
   * antes de guardarlo. La jornada de cada persona se lee de su pertenencia al equipo.
   */
  async previewSegment(input: {
    readonly startDate: Date;
    readonly endDate: Date;
    readonly members: readonly { teamMemberId: string; dailyPercent: number | null }[];
  }): Promise<PlannedForecastWeek[]> {
    const labels = await this.store.listMemberLabels(input.members.map((member) => member.teamMemberId));
    const weeklyHours = new Map(labels.map((label) => [label.teamMemberId, label.weeklyHours]));
    return planSegmentForecast({
      startDate: input.startDate,
      endDate: input.endDate,
      members: input.members.map((member) => ({ ...member, weeklyHours: weeklyHours.get(member.teamMemberId) ?? 0 })),
      nonWorkingDates: await this.store.listNonWorkingDates(input.startDate, input.endDate),
    });
  }

  /** HH semanales que cargaría una tarea con estos datos, sin guardar nada — mismo cálculo que `syncTask`. */
  async previewTask(input: {
    readonly moduleId: string;
    readonly teamId: string | null;
    readonly assigneeUserId: string;
    readonly startDate: Date;
    readonly date: Date;
    readonly estimatedHours: number;
  }): Promise<PlannedForecastWeek[]> {
    if (input.estimatedHours <= 0) return [];
    const teamMemberId = await this.store.findActiveTeamMemberId(input.assigneeUserId, input.teamId);
    if (!teamMemberId) return [];
    const module = await this.modules.findById(input.moduleId);
    return planTaskForecast({
      teamMemberId,
      startDate: input.startDate,
      endDate: input.date,
      estimatedHours: input.estimatedHours,
      nonWorkingDates: await this.store.listNonWorkingDates(input.startDate, input.date),
      coveredRanges: coveredRangesFor(module?.segments ?? [], teamMemberId),
      completedAt: null,
    });
  }

  /** "Recalcular desde proyectos": todos los tramos y tareas de los proyectos vivos. */
  async recalculateAll(now: Date): Promise<{ segments: number; tasks: number }> {
    const refs = await this.store.listLiveModules();
    let segments = 0;
    let tasks = 0;
    for (const ref of refs) {
      const project = { id: ref.projectId, clientId: ref.clientId, name: ref.projectName };
      const module = await this.modules.findById(ref.moduleId);
      if (!module) continue;
      for (const segment of module.segments) {
        await this.syncSegmentOf(project, segment, now);
        segments++;
      }
      await this.syncTasksOf(project, module, now);
      tasks += module.tasks.length;
    }
    return { segments, tasks };
  }

  private async syncSegmentOf(
    project: ForecastSourceProject,
    segment: ProjectModuleRecord['segments'][number],
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const nonWorkingDates = await this.store.listNonWorkingDates(segment.startDate, segment.endDate, context);
    const weeks = planSegmentForecast({
      startDate: segment.startDate,
      endDate: segment.endDate,
      members: segment.members,
      nonWorkingDates,
    });
    await this.apply(project, { kind: 'segment', segmentId: segment.id }, weeks, now, context);
  }

  private async syncTasksOf(project: ForecastSourceProject, module: ProjectModuleRecord, now: Date, context?: TransactionContext) {
    for (const task of module.tasks) await this.syncTaskOf(project, module, task, now, context);
  }

  private async syncTaskOf(
    project: ForecastSourceProject,
    module: ProjectModuleRecord,
    task: ProjectModuleTaskRecord,
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    let weeks: PlannedForecastWeek[] = [];
    const estimatedHours = task.estimatedHours ?? 0;
    const teamMemberId =
      task.assigneeUserId && estimatedHours > 0
        ? await this.store.findActiveTeamMemberId(task.assigneeUserId, task.teamId, context)
        : null;

    if (teamMemberId) {
      const coveredRanges = coveredRangesFor(module.segments, teamMemberId);
      weeks = planTaskForecast({
        teamMemberId,
        startDate: task.startDate,
        endDate: task.date,
        estimatedHours,
        nonWorkingDates: await this.store.listNonWorkingDates(task.startDate, task.date, context),
        coveredRanges,
        completedAt: task.status === 'done' ? task.completedAt : null,
      });
    }

    await this.apply(project, { kind: 'task', taskId: task.id }, weeks, now, context);
  }

  private async apply(
    project: ForecastSourceProject,
    source: ForecastSourceTarget['source'],
    weeks: readonly PlannedForecastWeek[],
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const changes = await this.store.syncSource({ source, projectId: project.id, clientId: project.clientId }, weeks, now, context);
    await this.recordHistory(project, source.kind, changes, context);
  }

  /** Cada cambio automático queda en "Ver historial" del Forecast, firmado por el sistema. */
  private async recordHistory(
    project: ForecastSourceProject,
    kind: ForecastSourceTarget['source']['kind'],
    changes: readonly ForecastSyncChange[],
    context?: TransactionContext,
  ): Promise<void> {
    if (changes.length === 0) return;
    const labels = new Map(
      (await this.store.listMemberLabels([...new Set(changes.map((c) => c.teamMemberId))], context)).map((label) => [
        label.teamMemberId,
        label,
      ]),
    );

    for (const change of changes) {
      const label = labels.get(change.teamMemberId);
      await this.audit.record({
        actor: { userId: null, email: null },
        action: change.action,
        entityType: 'forecast_assignment',
        entityId: change.assignmentId,
        metadata: {
          teamId: label?.teamId ?? null,
          teamName: label?.teamName ?? null,
          periodStart: change.periodStart.toISOString().slice(0, 10),
          periodEnd: change.periodEnd.toISOString().slice(0, 10),
          memberFullName: label?.fullName ?? null,
          type: 'project',
          projectName: project.name,
          clientName: null,
          assignedHours: change.assignedHours,
          comments: change.becameStale ? 'El cálculo cambió: el ajuste quedó desfasado.' : '',
          actorName: SYSTEM_ACTOR_NAMES[kind],
        },
      });
    }
  }
}

/** Días que la persona ya tiene cubiertos por un tramo del módulo con % diario — ahí una tarea no suma. */
function coveredRangesFor(segments: ProjectModuleRecord['segments'], teamMemberId: string): DateRange[] {
  return segments
    .filter((segment) => segment.members.some((m) => m.teamMemberId === teamMemberId && (m.dailyPercent ?? 0) > 0))
    .map((segment) => ({ start: segment.startDate, end: segment.endDate }));
}
