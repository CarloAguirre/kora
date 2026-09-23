import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
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
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';

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
    @Inject(CLOCK) private readonly clock: Clock,
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
    const id = await this.modules.addDelivery(
      {
        moduleId: command.moduleId,
        teamId: command.data.teamId ?? null,
        estimatedDate: new Date(command.data.estimatedDate),
      },
      now,
    );

    await this.changeLog.record(
      [
        {
          projectId: project.id,
          moduleId: command.moduleId,
          message: `Nueva entrega agregada en fase "${module.name}", estimada para ${new Date(command.data.estimatedDate).toLocaleDateString('es-CL')}.`,
        },
      ],
      command.actor.userId,
      now,
    );

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
