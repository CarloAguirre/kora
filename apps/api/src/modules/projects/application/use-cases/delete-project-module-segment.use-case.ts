import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { Permission } from '@kora/contracts';
import {
  CannotManageProjectError,
  ProjectModuleNotFoundError,
  ProjectModuleSegmentNotFoundError,
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
import { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import { linkedSegmentTaskIds } from '../../domain/services/linked-segment-task-ids';
import { ROADMAP_REFERENCE_EXCLUSION_STORE, type RoadmapReferenceExclusionStore } from '../ports/roadmap-reference-exclusion-store.port';

export interface DeleteProjectModuleSegmentCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly segmentId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class DeleteProjectModuleSegmentUseCase
  implements UseCase<DeleteProjectModuleSegmentCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    private readonly forecastSync: ForecastSourceSyncService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly progress: ProjectProgressRecalculator,
    @Inject(ROADMAP_REFERENCE_EXCLUSION_STORE) private readonly exclusions: RoadmapReferenceExclusionStore,
  ) {}

  async execute(command: DeleteProjectModuleSegmentCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!module.segments.some((segment) => segment.id === command.segmentId)) {
      return err(new ProjectModuleSegmentNotFoundError(command.segmentId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    // Guardar en auditoría la identidad de la planificación retirada: las FK
    // de hour_entries pasan a NULL, pero los registros y estados no se borran.
    const removedSegment = module.segments.find((segment) =>
      segment.id === command.segmentId)!;
    const linkedTaskIds = linkedSegmentTaskIds(module, removedSegment);
    const linkedTaskSet = new Set(linkedTaskIds);
    const removedTasks = module.tasks.filter((task) => linkedTaskSet.has(task.id))
      .map((task) => ({ id: task.id, name: task.name,
        estimatedHours: task.estimatedHours, status: task.status }));
    const removedDeliveries = module.deliveries.filter((delivery) =>
      delivery.segmentId === command.segmentId)
      .map((delivery) => ({ id: delivery.id, name: delivery.name, status: delivery.status }));
    // Eliminar el conjunto OPERATIVO; no tocar projects.sold_hours,
    // cotizaciones, EDT ni HH de hour_entries. Sin borrar las tareas vinculadas
    // se convertirían silenciosamente en tareas huérfanas por ON DELETE SET NULL.
    const removed = await this.unitOfWork.run(async (tx) => {
      const result = await this.modules.removeSegmentWithDependencies(command.segmentId, linkedTaskIds, tx);
      if (!result.removed) throw new ProjectModuleSegmentNotFoundError(command.segmentId);
      // Si hay otro bloque del mismo equipo, sus referencias siguen vigentes.
      // Si retiramos el último, impedir que vuelva como "pendiente de materializar".
      if (!module.segments.some((row) => row.id !== command.segmentId &&
          row.teamId === removedSegment.teamId)) {
        await this.exclusions.suppressTeamBlock(
          project.id, module.id, removedSegment.teamId, command.actor.userId, tx,
        );
      }
      await this.forecastSync.syncModuleTasks(project, command.moduleId, this.clock.now(), tx);
      await this.progress.recalculate(project.id, tx);
      return result;
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: {
        event: 'module_segment_deleted', moduleId: command.moduleId,
        segmentId: command.segmentId,
        taskCount: removed.taskCount, deliveryCount: removed.deliveryCount,
        segmentName: removedSegment.name, plannedHoursReleased: removedSegment.estimatedHours,
        tasksSnapshot: removedTasks, deliveriesSnapshot: removedDeliveries,
        quotationTeamReferencesSuppressed: !module.segments.some((row) =>
          row.id !== command.segmentId && row.teamId === removedSegment.teamId),
        soldHoursPreserved: true, hourEntriesPreserved: true,
      },
    });

    return ok(undefined);
  }
}
