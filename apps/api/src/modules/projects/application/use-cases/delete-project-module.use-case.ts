import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, err, ok, type ApplicationError, type Result, type UnitOfWork } from '@kora/core';
import type { Permission } from '@kora/contracts';
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
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';

export interface DeleteProjectModuleCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class DeleteProjectModuleUseCase implements UseCase<DeleteProjectModuleCommand, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    private readonly progress: ProjectProgressRecalculator,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: DeleteProjectModuleCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    // La BD elimina en cascada bloques, tareas, entregas, membresías y
    // exclusiones de referencias de esta fase. Las HH reales se conservan:
    // hour_entries.module_id / segment_id / task_id usan ON DELETE SET NULL.
    // El presupuesto vendido se conserva como valor del proyecto.
    await this.unitOfWork.run(async (tx) => {
      await this.modules.remove(command.moduleId, tx);
      await this.progress.recalculate(project.id, tx);
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: {
        event: 'module_deleted', moduleId: command.moduleId,
        phaseName: module.name, estimatedHoursReleased: module.estimatedHours,
        removedSegmentIds: module.segments.map((item) => item.id),
        removedTaskIds: module.tasks.map((item) => item.id),
        removedDeliveryIds: module.deliveries.map((item) => item.id),
        soldHoursPreserved: true, hourEntriesPreserved: true,
      },
    });

    return ok(undefined);
  }
}
