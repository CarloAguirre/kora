import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { TeamMemberNotFoundError } from '../../domain/errors/team.errors';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface RemoveTeamMemberCommand {
  readonly teamId: string;
  readonly memberId: string;
  readonly actor: ActorContext;
}

/** Retira a un miembro. No borra la fila: marca `left_at` para conservar el histórico de pertenencia. */
@Injectable()
export class RemoveTeamMemberUseCase implements UseCase<RemoveTeamMemberCommand, void, ApplicationError> {
  constructor(
    @Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RemoveTeamMemberCommand): Promise<Result<void, ApplicationError>> {
    const { teamId, memberId, actor } = command;

    const member = await this.members.findActiveById(memberId);
    if (!member || member.teamId !== teamId) return err(new TeamMemberNotFoundError(memberId));

    await this.members.remove(memberId, this.clock.now());

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'team',
      entityId: teamId,
      metadata: { event: 'member_removed', userId: member.userId },
    });

    return ok(undefined);
  }
}
