import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { CreateProjectModuleSegmentInput, Permission } from '@kora/contracts';
import {
  CannotManageProjectError,
  InvalidSegmentMemberError,
  ProjectModuleNotFoundError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateProjectModuleSegmentCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: CreateProjectModuleSegmentInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Tramo de trabajo de un equipo dentro de una fase/módulo (Roadmap) — con sus colaboradores, alimenta el Forecast. */
@Injectable()
export class CreateProjectModuleSegmentUseCase
  implements UseCase<CreateProjectModuleSegmentCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    private readonly forecastSync: ForecastSourceSyncService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    command: CreateProjectModuleSegmentCommand,
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

    const members = (command.data.members ?? []).map((member) => ({
      teamMemberId: member.teamMemberId,
      dailyPercent: member.dailyPercent ?? null,
    }));
    if (!(await this.forecastSync.membersBelongToTeam(command.data.teamId, members))) {
      return err(new InvalidSegmentMemberError());
    }

    const now = this.clock.now();
    // Tramo, colaboradores y filas de Forecast en una sola transacción: no queda un tramo a medio sincronizar.
    const id = await this.unitOfWork.run(async (tx) => {
      const segmentId = await this.modules.addSegment(
        {
          moduleId: command.moduleId,
          teamId: command.data.teamId,
          name: command.data.name,
          startDate: new Date(command.data.startDate),
          endDate: new Date(command.data.endDate),
        },
        now,
        tx,
      );
      await this.modules.replaceSegmentMembers(segmentId, members, now, tx);
      await this.forecastSync.syncSegment(project, command.moduleId, segmentId, now, tx);
      return segmentId;
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_segment_created', moduleId: command.moduleId, segmentId: id },
    });

    return ok({ id });
  }
}
