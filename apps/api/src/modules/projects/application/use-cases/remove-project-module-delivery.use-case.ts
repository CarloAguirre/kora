import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import {
  ProjectModuleDeliveryNotFoundError,
  ProjectModuleNotFoundError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
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

export interface RemoveProjectModuleDeliveryCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly deliveryId: string;
  readonly actor: ActorContext;
}

@Injectable()
export class RemoveProjectModuleDeliveryUseCase
  implements UseCase<RemoveProjectModuleDeliveryCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: RemoveProjectModuleDeliveryCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== command.projectId) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!module.deliveries.some((delivery) => delivery.id === command.deliveryId)) {
      return err(new ProjectModuleDeliveryNotFoundError(command.deliveryId));
    }

    await this.modules.removeDelivery(command.deliveryId);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'module_delivery_removed', moduleId: command.moduleId, deliveryId: command.deliveryId },
    });

    return ok(undefined);
  }
}
