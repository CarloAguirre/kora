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
import type { CreateProjectModuleTaskInput, Permission } from '@kora/contracts';
import { ProjectModuleNotFoundError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { formatCommittedDate } from '../services/deadline-note';

export interface CreateProjectModuleTaskCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: CreateProjectModuleTaskInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Tarea puntual de una fase/módulo — marcador en el Roadmap. Sin
 * `projects:manage`, puede crearla el líder del equipo indicado en
 * `data.teamId` (ver `ProjectTeamRepository.isTeamLeaderForProject`) o el
 * líder DE ESTE PROYECTO — sin equipo ni liderazgo de proyecto no hay contra
 * qué verificar, así que exige el permiso amplio.
 */
@Injectable()
export class CreateProjectModuleTaskUseCase
  implements UseCase<CreateProjectModuleTaskCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly projectTeamMembers: ProjectTeamMemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: CreateProjectModuleTaskCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      const teamId = command.data.teamId;
      const isTeamLeader =
        teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(project.id, teamId, command.actor.userId));
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta tarea.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    const now = this.clock.now();
    const assigneeUserId = command.data.assigneeUserId ?? null;
    const assigneeName = assigneeUserId
      ? (await this.projectTeamMembers.listForProject(project.id)).find((member) => member.userId === assigneeUserId)?.fullName
      : null;

    // Alta y registro en la misma transacción: no queda una tarea sin su registro de creación.
    const id = await this.unitOfWork.run(async (tx) => {
      const taskId = await this.modules.addTask(
        {
          moduleId: command.moduleId,
          teamId: command.data.teamId ?? null,
          assigneeUserId,
          name: command.data.name,
          description: command.data.description ?? null,
          startDate: command.data.startDate ? new Date(command.data.startDate) : null,
          date: new Date(command.data.date),
          estimatedHours: command.data.estimatedHours ?? null,
          status: command.data.status ?? 'todo',
          scope: command.data.scope ?? 'desarrollo',
        },
        now,
        tx,
      );
      await this.changeLog.record(
        [
          {
            projectId: project.id,
            moduleId: command.moduleId,
            taskId,
            message: `Nueva tarea "${command.data.name}" creada en fase "${module.name}"${assigneeName ? `, asignada a ${assigneeName}` : ''}, con fecha límite ${formatCommittedDate(new Date(command.data.date))}.`,
          },
        ],
        command.actor.userId,
        now,
        tx,
      );
      return taskId;
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_task_created', moduleId: command.moduleId, taskId: id },
    });

    return ok({ id });
  }
}
