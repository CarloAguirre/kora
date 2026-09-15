import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { AddProjectModuleDeliveryInput } from '@kora/contracts';
import { ProjectModuleNotFoundError, ProjectNotFoundError } from '../../domain/errors/project.errors';
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

export interface AddProjectModuleDeliveryCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: AddProjectModuleDeliveryInput;
  readonly actor: ActorContext;
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
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: AddProjectModuleDeliveryCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== command.projectId) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
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

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'module_delivery_added', moduleId: command.moduleId, deliveryId: id },
    });

    return ok({ id });
  }
}
