import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { RejectHourEntryInput, RoleCode } from '@kora/contracts';
import { HourEntryNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface RejectHourEntryCommand {
  readonly entryId: string;
  readonly data: RejectHourEntryInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

@Injectable()
export class RejectHourEntryUseCase implements UseCase<RejectHourEntryCommand, void, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    private readonly authority: HourEntryApprovalAuthorityService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectHourEntryCommand): Promise<Result<void, ApplicationError>> {
    const entry = await this.entries.findById(command.entryId);
    if (!entry) return err(new HourEntryNotFoundError(command.entryId));

    const canDecide = await this.authority.canDecide(command.actor.userId, command.actorRole, entry);
    if (!canDecide) return err(new ForbiddenError('No puedes rechazar este registro.', 'HOUR_ENTRY_CANNOT_REJECT'));

    const result = entry.reject(command.actor.userId, command.data.reason, this.clock.now());
    if (result.isErr()) return err(result.error);

    await this.entries.save(entry);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'hour_entry',
      entityId: entry.id,
      changes: { status: { before: 'pending', after: 'rejected' } },
      metadata: { reason: command.data.reason },
    });

    return ok(undefined);
  }
}
