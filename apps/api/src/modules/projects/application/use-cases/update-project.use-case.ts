import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { UpdateProjectInput } from '@kora/contracts';
import {
  ProjectNameAlreadyInUseError,
  ProjectNotFoundError,
  ReferencedClientNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import { PROJECT_CLIENT_READER, type ProjectClientReader } from '../ports/project-client-reader.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectCommand {
  readonly projectId: string;
  readonly data: UpdateProjectInput;
  readonly actor: ActorContext;
}

@Injectable()
export class UpdateProjectUseCase implements UseCase<UpdateProjectCommand, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_CLIENT_READER) private readonly clients: ProjectClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, data, actor } = command;

    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    if (data.clientId !== undefined && data.clientId !== null) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
    }

    if (data.name !== undefined && data.name.trim() !== project.name) {
      const clientId = data.clientId !== undefined ? data.clientId : project.clientId;
      if (await this.projects.nameIsTakenByAnother(data.name.trim(), clientId, project.id)) {
        return err(new ProjectNameAlreadyInUseError(data.name));
      }
    }

    const updated = project.updateDetails(
      {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
        ...(data.salesStage !== undefined ? { salesStage: data.salesStage } : {}),
        ...(data.phase !== undefined ? { phase: data.phase } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.leaderUserId !== undefined ? { leaderUserId: data.leaderUserId } : {}),
        ...(data.developerUserId !== undefined ? { developerUserId: data.developerUserId } : {}),
        ...(data.commercialManagerUserId !== undefined
          ? { commercialManagerUserId: data.commercialManagerUserId }
          : {}),
        ...(data.startDate !== undefined
          ? { startDate: data.startDate ? new Date(data.startDate) : null }
          : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.estimatedDeliveryDate !== undefined
          ? { estimatedDeliveryDate: data.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : null }
          : {}),
        ...(data.soldHours !== undefined ? { soldHours: data.soldHours } : {}),
        ...(data.expectedProgress !== undefined ? { expectedProgress: data.expectedProgress } : {}),
        ...(data.actualProgress !== undefined ? { actualProgress: data.actualProgress } : {}),
        ...(data.supportPlanDescription !== undefined
          ? { supportPlanDescription: data.supportPlanDescription || null }
          : {}),
        ...(data.supportHours !== undefined ? { supportHours: data.supportHours } : {}),
        ...(data.quotationLink !== undefined ? { quotationLink: data.quotationLink || null } : {}),
        ...(data.contractLink !== undefined ? { contractLink: data.contractLink || null } : {}),
      },
      this.clock.now(),
    );
    if (updated.isErr()) return err(updated.error);

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.projects.save(project, tx);
        if (data.teams) {
          for (const team of data.teams) {
            await this.projectTeams.save(
              {
                projectId: project.id,
                teamId: team.teamId,
                leaderUserId: team.leaderUserId ?? null,
                memberCount: team.memberCount ?? null,
                assignedHours: team.assignedHours ?? null,
              },
              tx,
            );
          }
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new ProjectNameAlreadyInUseError(data.name ?? project.name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
    });

    return ok(undefined);
  }
}
