import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { UpdateTeamInput } from '@kora/contracts';
import { TeamNameAlreadyInUseError, TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateTeamCommand {
  readonly teamId: string;
  readonly data: UpdateTeamInput;
  readonly actor: ActorContext;
}

@Injectable()
export class UpdateTeamUseCase implements UseCase<UpdateTeamCommand, void, ApplicationError> {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateTeamCommand): Promise<Result<void, ApplicationError>> {
    const { teamId, data, actor } = command;

    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    if (data.name !== undefined && data.name.trim() !== team.name) {
      if (await this.teams.nameIsTakenByAnother(data.name.trim(), team.id)) {
        return err(new TeamNameAlreadyInUseError(data.name));
      }
    }

    team.updateDetails(
      {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.leaderUserId !== undefined ? { leaderUserId: data.leaderUserId } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      this.clock.now(),
    );

    try {
      await this.teams.save(team);
    } catch (error) {
      if (isUniqueViolation(error)) return err(new TeamNameAlreadyInUseError(data.name ?? team.name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'team',
      entityId: team.id,
    });

    return ok(undefined);
  }
}
