import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ForbiddenError,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { Permission } from '@kora/contracts';
import {
  ProjectModuleNotFoundError,
  ProjectModuleTaskNotFoundError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import { ForecastSourceSyncService } from '../services/forecast-source-sync.service';

export interface DeleteProjectModuleTaskCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly forceCancel?: boolean;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class DeleteProjectModuleTaskUseCase
  implements UseCase<DeleteProjectModuleTaskCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    private readonly progress: ProjectProgressRecalculator,
    private readonly forecastSync: ForecastSourceSyncService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: DeleteProjectModuleTaskCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const task = module.tasks.find((t) => t.id === command.taskId);
    if (!task) return err(new ProjectModuleTaskNotFoundError(command.taskId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      const isTeamLeader =
        task.teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(project.id, task.teamId, command.actor.userId));
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta tarea.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    // No hay FK hour_entry -> task: la comprobación por módulo/colaborador es
    // deliberadamente conservadora. Si existe actividad o estado aprobado,
    // la tarea se CANCELA lógicamente, sin borrar horas ni trazabilidad.
    if (task.cancelledAt) return ok(undefined);
    const preserve = command.forceCancel === true || task.status === 'done' || task.status === 'in_review' ||
      (task.assigneeUserId !== null &&
        await this.modules.hasTaskUserHours(project.id, command.moduleId, task.assigneeUserId));

    // Todo el cambio sucede en la misma transacción que la bitácora y el recálculo.
    await this.unitOfWork.run(async (tx) => {
      if (preserve) await this.modules.cancelTask(command.taskId, this.clock.now(), tx);
      else await this.modules.removeTask(command.taskId, tx);
      // Una tarea convertida de la EDT no debe reaparecer como "Por asignar"
      // después de borrarla. Se oculta solo la referencia OPERATIVA, sin alterar
      // la cotización; ambas escrituras comparten la misma transacción.
      const quoteMarker = task.description?.match(
        /^Referencia cotización ([0-9a-fA-F-]{36}) · WBS (.+?) · (.+)$/m,
      );
      if (!preserve && quoteMarker && quoteMarker[2]!.length <= 160 && quoteMarker[3]!.length <= 160) {
        await this.modules.excludeQuotationReference({
          projectId: project.id, moduleId: command.moduleId,
          versionId: quoteMarker[1]!, wbs: quoteMarker[2]!, role: quoteMarker[3]!,
          actorUserId: command.actor.userId,
        }, tx);
      }
      if (task.segmentId) await this.modules.refreshSegmentClosure(task.segmentId, this.clock.now(), tx);
      await this.progress.recalculate(project.id, tx);
      if (preserve) await this.forecastSync.syncTask(project, command.moduleId, command.taskId, this.clock.now(), tx);
      await this.changeLog.record(
        [
          {
            projectId: project.id,
            moduleId: command.moduleId,
            message: `Tarea "${task.name}" ${preserve ? 'cancelada (se conserva historial)' : 'eliminada'} de la fase "${module.name}".`,
          },
        ],
        command.actor.userId,
        this.clock.now(),
        tx,
      );
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: preserve ? 'module_task_cancelled' : 'module_task_deleted',
        moduleId: command.moduleId, taskId: command.taskId },
    });

    return ok(undefined);
  }
}
