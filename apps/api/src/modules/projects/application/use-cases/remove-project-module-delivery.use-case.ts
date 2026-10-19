import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { Permission } from '@kora/contracts';
import {
  CannotManageProjectError,
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
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';

export interface RemoveProjectModuleDeliveryCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly deliveryId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class RemoveProjectModuleDeliveryUseCase
  implements UseCase<RemoveProjectModuleDeliveryCommand, void, ApplicationError>
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

  async execute(command: RemoveProjectModuleDeliveryCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const delivery = module.deliveries.find((d) => d.id === command.deliveryId);
    if (!delivery) return err(new ProjectModuleDeliveryNotFoundError(command.deliveryId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    // Es un borrado físico: sin este registro no quedaría rastro de que la entrega existió — por eso
    // van en la misma transacción.
    await this.unitOfWork.run(async (tx) => {
      await this.modules.removeDelivery(command.deliveryId, tx);
      await this.changeLog.record(
        [
          {
            projectId: project.id,
            moduleId: command.moduleId,
            // Sin `deliveryId`: la entrega ya no existe (FK), y sus registros previos quedan sin vínculo (`set null`).
            message: `Entrega${delivery.name ? ` "${delivery.name}"` : ''} eliminada de la fase "${module.name}".`,
          },
        ],
        command.actor.userId,
        this.clock.now(),
        tx,
      );
      await this.progress.recalculate(project.id, tx);
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_delivery_removed', moduleId: command.moduleId, deliveryId: command.deliveryId },
    });

    return ok(undefined);
  }
}
