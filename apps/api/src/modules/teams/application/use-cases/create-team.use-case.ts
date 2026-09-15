import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type Result,
} from '@kora/core';
import type { CreateTeamInput } from '@kora/contracts';
import { Team } from '../../domain/entities/team.entity';
import { TeamNameAlreadyInUseError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateTeamCommand {
  readonly data: CreateTeamInput;
  readonly actor: ActorContext;
}

@Injectable()
export class CreateTeamUseCase implements UseCase<CreateTeamCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateTeamCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;

    if (await this.teams.nameIsTakenByAnother(data.name.trim(), null)) {
      return err(new TeamNameAlreadyInUseError(data.name));
    }

    const team = Team.create({
      id: this.ids.generate(),
      name: data.name,
      description: data.description,
      leaderUserId: data.leaderUserId,
      teamTypeId: data.teamTypeId,
      now: this.clock.now(),
    });

    try {
      await this.teams.save(team);
    } catch (error) {
      if (isUniqueViolation(error)) return err(new TeamNameAlreadyInUseError(data.name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'team',
      entityId: team.id,
      metadata: { name: data.name },
    });

    return ok({ id: team.id });
  }
}
