import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { RoleCode, UpdateHourEntryInput } from '@kora/contracts';
import {
  HourEntryNotFoundError,
  HourEntryOutsideCurrentMonthError,
  InvalidDesignatedApproverError,
  ModuleNotInProjectError,
  ProjectOvertimeNotAllowedError,
  ProjectStoppedError,
  ReferencedModuleNotFoundError,
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
 * Para todos, solo dentro del mes en curso (y sin mover el registro a otro mes).
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
    if (!isInCurrentMonth(entry.date, now) || (data.date && !isInCurrentMonth(new Date(data.date), now))) {
      return err(new HourEntryOutsideCurrentMonthError());
    }

    const editApproved = entry.status === 'approved' && isApprover;
    const previousProjectId = entry.projectId;
    const wasApproved = entry.status === 'approved';

    const isOvertime = data.isOvertime !== undefined ? data.isOvertime : entry.isOvertime;
    const projectId = data.projectId !== undefined ? data.projectId : entry.projectId;

    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));
      if (project.status === 'on_hold') return err(new ProjectStoppedError());
      if (isOvertime && !project.allowsOvertime) return err(new ProjectOvertimeNotAllowedError());
    } else if (data.isOvertime === true && !entry.isOvertime && projectId) {
      // Solo al MARCAR como extra: un registro que ya nació extra (p. ej. el
      // excedente de 8h de una solicitud de ticket de soporte, que no exige
      // autorización) sigue siendo editable aunque el proyecto no las autorice.
      const project = await this.projects.findById(projectId);
      if (project && !project.allowsOvertime) return err(new ProjectOvertimeNotAllowedError());
    }

    if (data.designatedApproverUserId) {
      const approver = await this.users.findById(data.designatedApproverUserId);
      if (!approver || approver.role !== 'leader' || approver.status !== 'active') {
        return err(new InvalidDesignatedApproverError());
      }
    }

    const moduleId = data.moduleId !== undefined ? data.moduleId : entry.toSnapshot().moduleId;
    if (moduleId) {
      const module = await this.projects.findModuleById(moduleId);
      if (!module) return err(new ReferencedModuleNotFoundError(moduleId));
      if (module.projectId !== projectId) return err(new ModuleNotInProjectError());
    }

    const owner = await this.users.findById(entry.userId);
    // Horas extra siempre exigen aprobación de líder, aunque el rol del dueño no la requiera.
    const ownerRequiresApproval = owner?.role === 'collaborator' || isOvertime;

    const result = entry.updateDetails(
      {
        assignment: data.assignment,
        projectId: data.projectId === undefined ? undefined : data.projectId,
        moduleId: data.moduleId === undefined ? undefined : data.moduleId,
        category: data.category,
        description: data.description,
        hours: data.hours,
        date: data.date ? new Date(data.date) : undefined,
        isOvertime: data.isOvertime,
        designatedApproverUserId: data.designatedApproverUserId === undefined ? undefined : data.designatedApproverUserId,
        hasBlocker: data.hasBlocker,
        blockerDescription: data.blockerDescription === undefined ? undefined : data.blockerDescription,
      },
      ownerRequiresApproval,
      now,
      { editApproved },
    );
    if (result.isErr()) return err(result.error);

    await this.entries.save(entry);

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

    return ok(undefined);
  }
}
