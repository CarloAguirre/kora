import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { TeamAlreadyDeletedError, TeamHasActiveMembersError, TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteTeamCommand {
  readonly teamId: string;
  readonly actor: ActorContext;
}

@Injectable()
export class DeleteTeamUseCase implements UseCase<DeleteTeamCommand, void, ApplicationError> {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteTeamCommand): Promise<Result<void, ApplicationError>> {
    const team = await this.teams.findById(command.teamId);
    if (!team) return err(new TeamNotFoundError(command.teamId));
    if (team.isDeleted) return err(new TeamAlreadyDeletedError());

    const activeMembers = await this.teams.countActiveMembers(team.id);
    if (activeMembers > 0) return err(new TeamHasActiveMembersError(activeMembers));

    team.softDelete(this.clock.now());
    await this.teams.save(team);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'delete',
      entityType: 'team',
      entityId: team.id,
      metadata: { name: team.name },
    });

    return ok(undefined);
  }
}
