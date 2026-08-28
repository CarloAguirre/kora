import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { CreateProjectInput } from '@kora/contracts';
import { Project } from '../../domain/entities/project.entity';
import { ProjectNameAlreadyInUseError, ReferencedClientNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import { PROJECT_CLIENT_READER, type ProjectClientReader } from '../ports/project-client-reader.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateProjectCommand {
  readonly data: CreateProjectInput;
  readonly actor: ActorContext;
}

@Injectable()
export class CreateProjectUseCase
  implements UseCase<CreateProjectCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_CLIENT_READER) private readonly clients: ProjectClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateProjectCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;

    if (data.clientId) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
    }

    if (await this.projects.nameIsTakenByAnother(data.name, data.clientId ?? null, null)) {
      return err(new ProjectNameAlreadyInUseError(data.name));
    }

    const created = Project.create({
      id: this.ids.generate(),
      name: data.name,
      clientId: data.clientId,
      type: data.type,
      salesStage: data.salesStage,
      priority: data.priority,
      leaderUserId: data.leaderUserId,
      developerUserId: data.developerUserId,
      commercialManagerUserId: data.commercialManagerUserId,
      startDate: data.startDate ? new Date(data.startDate) : null,
      estimatedDeliveryDate: data.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : null,
      soldHours: data.soldHours,
      supportPlanDescription: data.supportPlanDescription,
      supportHours: data.supportHours,
      quotationLink: data.quotationLink,
      contractLink: data.contractLink,
      additionalLinks: data.additionalLinks,
      phase: data.phase,
      status: data.status,
      now: this.clock.now(),
    });
    if (created.isErr()) return err(created.error);
    const project = created.value;

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.projects.save(project, tx);
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
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new ProjectNameAlreadyInUseError(data.name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'project',
      entityId: project.id,
      metadata: { name: data.name, type: data.type },
    });

    return ok({ id: project.id });
  }
}
