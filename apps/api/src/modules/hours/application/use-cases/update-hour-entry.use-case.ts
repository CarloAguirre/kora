import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import { hourEntryRequiresApproval, type RoleCode, type UpdateHourEntryInput } from '@kora/contracts';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import { splitByDailyCap, type HoursTranche } from '../../domain/services/daily-cap';
import {
  HourEntryNotFoundError,
  HourEntryOutsideCurrentMonthError,
  InvalidDesignatedApproverError,
  ModuleNotInProjectError,
  SegmentNotInModuleError,
  ProjectClosedError,
  ProjectOvertimeNotAllowedError,
  ProjectStoppedError,
  ReferencedModuleNotFoundError,
  InvalidHourEntrySegmentError,
  HourEntrySegmentRequiredError,
  ReferencedProjectNotFoundError,
} from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import { isInCurrentMonth } from '../services/hour-entry-edit-window';
import { HOUR_ENTRY_USER_READER, type HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateHourEntryCommand {
  readonly entryId: string;
  readonly data: UpdateHourEntryInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Editan: el dueño o un admin/PMO (pendiente/rechazado) y quien debe aprobarlo
 * (pendiente). Un registro aprobado solo lo corrige quien puede aprobarlo
 * (incluye admin/PMO) — desde el "Historial Reciente" del líder — y sigue aprobado.
 * Salvo admin/PMO (que editan cualquier registro), solo dentro del mes en curso
 * (y sin mover el registro a otro mes).
 *
 * Lo que una hora normal pase de la jornada de 8h del día queda como horas
 * extra (ver `splitByDailyCap`).
 */
@Injectable()
export class UpdateHourEntryUseCase implements UseCase<UpdateHourEntryCommand, void, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    private readonly authority: HourEntryApprovalAuthorityService,
    @Inject(HOUR_ENTRY_USER_READER) private readonly users: HourEntryUserReader,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: UpdateHourEntryCommand): Promise<Result<void, ApplicationError>> {
    const { entryId, data, actor, actorRole } = command;
    const entry = await this.entries.findById(entryId);
    if (!entry) return err(new HourEntryNotFoundError(entryId));

    const isOwner = entry.userId === actor.userId;
    // Quien debe aprobar puede corregir un registro pendiente antes de decidir
    // (en vez de rechazarlo solo para un ajuste) o uno ya aprobado.
    const isApprover =
      (entry.status === 'pending' || entry.status === 'approved') &&
      (await this.authority.canDecide(actor.userId, actorRole, entry));
    const isAdminLike = actorRole === 'admin' || actorRole === 'pmo';
    if (!isOwner && !isAdminLike && !isApprover) {
      return err(new ForbiddenError('No puedes editar este registro.', 'HOUR_ENTRY_CANNOT_EDIT'));
    }

    const now = this.clock.now();
    if (!isAdminLike && (!isInCurrentMonth(entry.date, now) || (data.date && !isInCurrentMonth(new Date(data.date), now)))) {
      return err(new HourEntryOutsideCurrentMonthError());
    }

    const editApproved = entry.status === 'approved' && isApprover;
    const previousProjectId = entry.projectId;
    const wasApproved = entry.status === 'approved';

    const isOvertime = data.isOvertime !== undefined ? data.isOvertime : entry.isOvertime;
    const projectId = data.projectId !== undefined ? data.projectId : entry.projectId;

    // Consultar la autorización del proyecto efectivo incluso si no cambia
    // en el PATCH. La regla también aplica al excedente automático de 8h.
    const project = projectId ? await this.projects.findById(projectId) : null;
    if (projectId && !project) return err(new ReferencedProjectNotFoundError(projectId));
    // Detenido/finalizado solo impide MOVER horas a ese proyecto.
    if (project && projectId !== previousProjectId) {
      if (project.status === 'on_hold') return err(new ProjectStoppedError());
      if (project.status === 'finished' || project.status === 'cancelled') return err(new ProjectClosedError());
    }

    if (data.designatedApproverUserId) {
      const approver = await this.users.findById(data.designatedApproverUserId);
      if (!approver || approver.role !== 'leader' || approver.status !== 'active') {
        return err(new InvalidDesignatedApproverError());
      }
    }

    const previous = entry.toSnapshot();
    const moduleId = data.moduleId !== undefined ? data.moduleId : previous.moduleId;
    // Sin `segmentId` explícito, el tramo se conserva solo si la fase no cambió.
    const segmentId =
      data.segmentId !== undefined
        ? data.segmentId
        : (moduleId ?? null) === previous.moduleId
          ? previous.segmentId
          : null;
    const taskId = data.taskId !== undefined
      ? data.taskId
      : (moduleId === previous.moduleId && segmentId === previous.segmentId &&
         projectId === previous.projectId ? previous.taskId ?? null : null);
    if (moduleId) {
      const module = await this.projects.findModuleById(moduleId);
      if (!module) return err(new ReferencedModuleNotFoundError(moduleId));
      if (module.projectId !== projectId) return err(new ModuleNotInProjectError());
      if (segmentId && !module.segments.some((segment) => segment.id === segmentId)) {
        return err(new SegmentNotInModuleError());
      }
      if (taskId && (taskId !== previous.taskId || segmentId !== previous.segmentId ||
        moduleId !== previous.moduleId || projectId !== previous.projectId) &&
        !module.tasks?.some((task) => task.id === taskId && !task.cancelledAt &&
          task.assigneeUserId === entry.userId && task.segmentId === (segmentId ?? null))) {
        return err(new ForbiddenError('Selecciona una tarea activa, asignada al autor y al bloque elegido.', 'HOUR_ENTRY_TASK_INVALID'));
      }
    }
    if (taskId && !moduleId) {
      return err(new ForbiddenError('Selecciona una fase antes de elegir la tarea.', 'HOUR_ENTRY_TASK_INVALID'));
    }

    if (projectId && !moduleId && data.projectId !== undefined &&
      await this.projects.hasAttributableWorkBlocks(projectId, entry.userId)) {
      return err(new HourEntrySegmentRequiredError());
    }
    if (segmentId && !moduleId) {
      return err(new InvalidHourEntrySegmentError('Selecciona la fase antes de elegir un bloque.'));
    }
    if (moduleId) {
      const segments = await this.projects.findSegmentsForModule(moduleId);
      if (segmentId) {
        const selected = segments.find((segment) =>
          segment.id === segmentId && segment.projectId === projectId);
        if (!selected || !await this.projects.isUserOnSegmentTeam(
          selected.projectId, selected.teamId, entry.userId,
        )) return err(new InvalidHourEntrySegmentError());
      } else if (data.segmentId !== undefined || (data.moduleId !== undefined &&
        data.moduleId !== previous.moduleId)) {
        const hasEligibleSegment = (await Promise.all(segments.map((segment) =>
          this.projects.isUserOnSegmentTeam(segment.projectId, segment.teamId, entry.userId),
        ))).some(Boolean);
        if (hasEligibleSegment) return err(new HourEntrySegmentRequiredError());
      }
    }
    // Una hora normal que con la edición pase de la jornada de 8h del día se
    // queda con lo que cabe; el resto pasa a un registro nuevo de horas extra
    // (o el registro entero, si la jornada ya estaba completa) — misma regla
    // que el alta (`CreateHourEntryUseCase`). Fuera de rango no se divide:
    // lo rechaza `updateDetails`.
    const hours = data.hours ?? entry.hours;
    const date = data.date ? new Date(data.date) : entry.date;
    const [ownTranche, overtimeTranche]: HoursTranche[] =
      isOvertime || !(hours > 0) || hours > 24
        ? [{ hours, isOvertime }]
        : splitByDailyCap(hours, await this.entries.sumRegularHoursForUserAndDate(entry.userId, date, entry.id));

    // Los registros históricos de ticket que ya nacieron como extra pueden
    // corregirse sin aumentar HH, cambiar fecha o mover proyecto. No se
    // permite convertir nuevos excedentes de proyectos no autorizados.
    const editingExistingOvertime = entry.isOvertime && isOvertime &&
      projectId === previousProjectId && hours <= entry.hours &&
      date.getTime() === entry.date.getTime();
    if (project && !project.allowsOvertime &&
        (ownTranche!.isOvertime || overtimeTranche !== undefined) && !editingExistingOvertime) {
      return err(new ProjectOvertimeNotAllowedError());
    }

    const owner = await this.users.findById(entry.userId);
    const ownerRequiresApproval = hourEntryRequiresApproval(owner?.role, ownTranche!.isOvertime);

    const result = entry.updateDetails(
      {
        assignment: data.assignment,
        projectId: data.projectId === undefined ? undefined : data.projectId,
        moduleId: data.moduleId === undefined ? undefined : data.moduleId,
        segmentId: moduleId ? (segmentId ?? null) : null,
        taskId: moduleId ? taskId : null,
        category: data.category,
        description: data.description,
        hours: ownTranche!.hours,
        date: data.date ? new Date(data.date) : undefined,
        isOvertime: ownTranche!.isOvertime,
        designatedApproverUserId: data.designatedApproverUserId === undefined ? undefined : data.designatedApproverUserId,
        hasBlocker: data.hasBlocker,
        blockerDescription: data.blockerDescription === undefined ? undefined : data.blockerDescription,
      },
      ownerRequiresApproval,
      now,
      { editApproved },
    );
    if (result.isErr()) return err(result.error);

    let overtimeEntry: HourEntry | null = null;
    if (overtimeTranche) {
      const updated = entry.toSnapshot();
      const created = HourEntry.create({
        id: this.ids.generate(),
        userId: updated.userId,
        projectId: updated.projectId,
        moduleId: updated.moduleId,
        segmentId: updated.segmentId,
        taskId: updated.taskId ?? null,
        assignment: updated.assignment ?? '',
        category: updated.category,
        description: updated.description,
        hours: overtimeTranche.hours,
        date: updated.date,
        isOvertime: true,
        projectStageAtEntry: updated.projectStageAtEntry,
        designatedApproverUserId: updated.designatedApproverUserId,
        ownerRequiresApproval: hourEntryRequiresApproval(owner?.role, true),
        now,
      });
      if (created.isErr()) return err(created.error);
      overtimeEntry = created.value;
    }

    await this.entries.save(entry);
    if (overtimeEntry) await this.entries.save(overtimeEntry);

    if (entry.projectId && entry.status === 'approved') {
      const usedHours = await this.entries.sumApprovedHoursForProject(entry.projectId);
      await this.projects.recalculateUsedHours(entry.projectId, usedHours);
    }
    // Un aprobado que cambió de proyecto deja de sumar en el anterior.
    if (wasApproved && previousProjectId && previousProjectId !== entry.projectId) {
      const usedHours = await this.entries.sumApprovedHoursForProject(previousProjectId);
      await this.projects.recalculateUsedHours(previousProjectId, usedHours);
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'hour_entry',
      entityId: entry.id,
    });
    if (overtimeEntry) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'create',
        entityType: 'hour_entry',
        entityId: overtimeEntry.id,
        metadata: { ownerId: entry.userId, hours: overtimeEntry.hours, isOvertime: true, status: overtimeEntry.status, splitFrom: entry.id },
      });
    }

    return ok(undefined);
  }
}
