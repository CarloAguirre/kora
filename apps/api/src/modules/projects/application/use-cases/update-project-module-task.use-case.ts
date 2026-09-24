import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectModuleTaskInput } from '@kora/contracts';
import {
  ProjectModuleNotFoundError,
  ProjectModuleTaskNotFoundError,
  ProjectNotFoundError,
  RejectionReasonRequiredError,
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

export interface UpdateProjectModuleTaskCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly data: UpdateProjectModuleTaskInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Además del líder (`projects:manage`), de quien lidera el equipo de la tarea
 * y de quien lidera EL PROYECTO (edición completa, igual que si pudiera
 * crearla), la persona asignada puede actualizarla — pero solo su `status`
 * ("Iniciar"/"Marcar como lista para revisión" en "Mis tareas"), no
 * reasignarla ni cambiar sus fechas, y sin poder saltar directo a
 * `done`: solo quien administra el proyecto o lidera el equipo puede
 * aprobar (`done`), rechazar (`in_progress` + `rejectionReason`) o revertir
 * (`in_review`) — ver `PROJECT_MODULE_TASK_ASSIGNEE_ALLOWED_STATUSES`.
 */
const PROJECT_MODULE_TASK_ASSIGNEE_ALLOWED_STATUSES = new Set(['todo', 'in_progress', 'in_review']);
@Injectable()
export class UpdateProjectModuleTaskUseCase
  implements UseCase<UpdateProjectModuleTaskCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectModuleTaskCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const task = module.tasks.find((t) => t.id === command.taskId);
    if (!task) return err(new ProjectModuleTaskNotFoundError(command.taskId));

    const canManage =
      command.actorPermissions.includes('projects:manage') || project.leaderUserId === command.actor.userId;
    if (!canManage) {
      const isTeamLeader =
        task.teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(project.id, task.teamId, command.actor.userId));
      if (!isTeamLeader) {
        if (task.assigneeUserId !== command.actor.userId) {
          return err(new ForbiddenError('No tienes acceso a esta tarea.', 'PROJECT_MODULE_TASK_NOT_ASSIGNEE'));
        }
        const onlyStatus = Object.keys(command.data).every((key) => key === 'status');
        if (!onlyStatus) {
          return err(new ForbiddenError('Solo puedes cambiar el estado de tu tarea.', 'PROJECT_MODULE_TASK_LIMITED_UPDATE'));
        }
        if (command.data.status !== undefined && !PROJECT_MODULE_TASK_ASSIGNEE_ALLOWED_STATUSES.has(command.data.status)) {
          return err(
            new ForbiddenError('Solo quien lidera el equipo o el proyecto puede aprobar tu tarea.', 'PROJECT_MODULE_TASK_LIMITED_UPDATE'),
          );
        }
      }
    }

    const now = this.clock.now();
    const nextStatus = command.data.status;
    if (nextStatus === 'in_progress' && task.status === 'in_review' && !command.data.rejectionReason?.trim()) {
      return err(new RejectionReasonRequiredError());
    }
    const completedAt =
      nextStatus === undefined
        ? undefined
        : nextStatus === 'done'
          ? now
          : task.status === 'done'
            ? null
            : undefined;
    // Cualquier cambio de estado limpia el motivo de un rechazo anterior, salvo que este mismo
    // llamado sea el que lo está fijando (rechazo explícito con su motivo).
    const rejectionReason =
      command.data.rejectionReason !== undefined
        ? (command.data.rejectionReason ?? null)
        : nextStatus !== undefined
          ? null
          : undefined;

    await this.modules.updateTask(
      command.taskId,
      {
        ...(command.data.teamId !== undefined ? { teamId: command.data.teamId ?? null } : {}),
        ...(command.data.assigneeUserId !== undefined ? { assigneeUserId: command.data.assigneeUserId ?? null } : {}),
        ...(command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.data.description !== undefined ? { description: command.data.description ?? null } : {}),
        ...(command.data.startDate !== undefined
          ? { startDate: command.data.startDate ? new Date(command.data.startDate) : null }
          : {}),
        ...(command.data.date !== undefined ? { date: new Date(command.data.date) } : {}),
        ...(command.data.estimatedHours !== undefined
          ? { estimatedHours: command.data.estimatedHours ?? null }
          : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(command.data.scope !== undefined ? { scope: command.data.scope } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        ...(rejectionReason !== undefined ? { rejectionReason } : {}),
      },
      now,
    );

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_task_updated', moduleId: command.moduleId, taskId: command.taskId },
    });

    return ok(undefined);
  }
}
