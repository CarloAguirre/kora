import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, ForbiddenError, err, ok,
  type ApplicationError, type Result, type Clock, type UnitOfWork } from '@kora/core';
import type { Permission } from '@kora/contracts';
import { ProjectNotFoundError, ProjectTeamMemberNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import { PROJECT_MODULE_REPOSITORY, type ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UnassignProjectTeamMemberCommand {
  readonly projectId: string;
  readonly assignmentId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Sin `projects:manage`, solo puede desasignar quien lidera el equipo de esa asignación. */
@Injectable()
export class UnassignProjectTeamMemberUseCase
  implements UseCase<UnassignProjectTeamMemberCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    private readonly progress: ProjectProgressRecalculator,
    private readonly forecast: ForecastSourceSyncService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnassignProjectTeamMemberCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, assignmentId, actor } = command;

    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    const assignment = await this.members.findById(assignmentId);
    if (!assignment || assignment.projectId !== project.id) {
      return err(new ProjectTeamMemberNotFoundError(assignmentId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== actor.userId) {
      const isTeamLeader = await this.projectTeams.isTeamLeaderForProject(project.id, assignment.teamId, actor.userId);
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta persona.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    // Bloqueo lógico: conserva asignación y HH históricas para auditoría, pero
    // deja de contar en los cupos y libera las tareas abiertas del colaborador.
    // Las aprobadas/en revisión mantienen autoría y horas históricas.
    const now = this.clock.now();
    let released = 0;
    await this.uow.run(async (tx) => {
      const modules = await this.modules.listForProject(project.id, tx);
      for (const module of modules) {
        for (const task of module.tasks) {
          if (task.teamId !== assignment.teamId || task.assigneeUserId !== assignment.userId ||
            !['todo', 'in_progress'].includes(task.status) || task.cancelledAt) continue;
          await this.modules.updateTask(task.id, {
            assigneeUserId: null, status: 'todo', completedAt: null, rejectionReason: null,
          }, now, tx);
          await this.forecast.syncTask(project, module.id, task.id, now, tx);
          if (task.segmentId) await this.modules.refreshSegmentClosure(task.segmentId, now, tx);
          released++;
        }
      }
      await this.members.block(assignmentId, now, tx);
      await this.progress.recalculate(project.id, tx);
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'member_blocked', userId: assignment.userId, releasedTasks: released, preservedHours: assignment.consumedHours },
    });

    return ok(undefined);
  }
}
