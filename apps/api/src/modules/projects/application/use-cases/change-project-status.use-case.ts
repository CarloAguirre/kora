import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { PROJECT_STATUS_LABELS, type ChangeProjectStatusInput, type Permission } from '@kora/contracts';
import {
  CannotManageProjectError,
  CannotManuallyActivateProjectError,
  ManualHito0ReasonRequiredError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';

export interface ChangeProjectStatusCommand {
  readonly projectId: string;
  readonly data: ChangeProjectStatusInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class ChangeProjectStatusUseCase
  implements UseCase<ChangeProjectStatusCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeProjectStatusCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    const previousStatus = project.status;
    if (previousStatus === command.data.status) return ok(undefined);

    /**
     * Hito 0 manual (sin factura): activar a mano un proyecto `development`
     * `aprobado` que seguía "No iniciado" — Gerencia/PMO, no el líder por sí
     * solo, y con motivo/referencia obligatorio (contrato firmado, OC, etc).
     */
    const isManualHito0 =
      previousStatus === 'draft' && command.data.status === 'active' && project.type === 'development' && project.salesStage === 'approved';

    const now = this.clock.now();
    let message = `Estado del proyecto cambiado de "${PROJECT_STATUS_LABELS[previousStatus]}" a "${PROJECT_STATUS_LABELS[command.data.status]}".`;
    if (isManualHito0) {
      if (!command.actorPermissions.includes('projects:manage')) return err(new CannotManuallyActivateProjectError());
      const reason = command.data.reason?.trim();
      if (!reason) return err(new ManualHito0ReasonRequiredError());
      project.activateFromHito0(now, 'manual', reason);
      message = `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${reason}`;
    } else {
      project.changeStatus(command.data.status, now);
    }
    await this.projects.save(project);

    await this.changeLog.record([{ projectId: project.id, message, isHito0: isManualHito0 }], command.actor.userId, now);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'project',
      entityId: project.id,
      changes: { status: { before: previousStatus, after: command.data.status } },
    });

    return ok(undefined);
  }
}
