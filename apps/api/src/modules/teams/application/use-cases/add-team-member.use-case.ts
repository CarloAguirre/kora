import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { AddTeamMemberInput } from '@kora/contracts';
import {
  TeamMemberAlreadyActiveError,
  TeamNotFoundError,
} from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface AddTeamMemberCommand {
  readonly teamId: string;
  readonly data: AddTeamMemberInput;
  readonly actor: ActorContext;
}

@Injectable()
export class AddTeamMemberUseCase
  implements UseCase<AddTeamMemberCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: AddTeamMemberCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const { teamId, data, actor } = command;

    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    const existing = await this.members.findActiveByUserAndTeam(data.userId, teamId);
    if (existing) return err(new TeamMemberAlreadyActiveError());

    const now = this.clock.now();
    const id = await this.members.add({
      teamId,
      userId: data.userId,
      position: data.position || null,
      weeklyHours: data.weeklyHours,
      joinedAt: now,
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'team',
      entityId: teamId,
      metadata: { event: 'member_added', userId: data.userId },
    });

    return ok({ id });
  }
}
