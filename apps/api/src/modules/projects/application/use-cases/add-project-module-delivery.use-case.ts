import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { AddProjectModuleDeliveryInput, Permission } from '@kora/contracts';
import { CannotManageProjectError, ProjectModuleNotFoundError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { formatCommittedDate } from '../services/deadline-note';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';

export interface AddProjectModuleDeliveryCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: AddProjectModuleDeliveryInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Cada entrega estimada hace de hito "Entrega a cliente" (nace en estado Planificada). */
@Injectable()
export class AddProjectModuleDeliveryUseCase
  implements UseCase<AddProjectModuleDeliveryCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    private readonly progress: ProjectProgressRecalculator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    command: AddProjectModuleDeliveryCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    const now = this.clock.now();
    // Alta y registro en la misma transacción: no queda una entrega sin su registro de creación.
    const id = await this.unitOfWork.run(async (tx) => {
      const deliveryId = await this.modules.addDelivery(
        {
          moduleId: command.moduleId,
          teamId: command.data.teamId ?? null,
          name: command.data.name,
          description: command.data.description ?? null,
          assigneeUserId: command.data.assigneeUserId ?? null,
          estimatedDate: new Date(command.data.estimatedDate),
        },
        now,
        tx,
      );
      await this.changeLog.record(
        [
          {
            projectId: project.id,
            moduleId: command.moduleId,
            deliveryId,
            message: `Nueva entrega "${command.data.name}" agregada en fase "${module.name}", estimada para ${formatCommittedDate(new Date(command.data.estimatedDate))}.`,
          },
        ],
        command.actor.userId,
        now,
        tx,
      );
      await this.progress.recalculate(project.id, tx);
      return deliveryId;
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_delivery_added', moduleId: command.moduleId, deliveryId: id },
    });

    return ok({ id });
  }
}
