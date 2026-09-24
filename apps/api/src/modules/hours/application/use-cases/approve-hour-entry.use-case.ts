import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import { HourEntryNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ApproveHourEntryCommand {
  readonly entryId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

@Injectable()
export class ApproveHourEntryUseCase implements UseCase<ApproveHourEntryCommand, void, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    private readonly authority: HourEntryApprovalAuthorityService,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ApproveHourEntryCommand): Promise<Result<void, ApplicationError>> {
    const entry = await this.entries.findById(command.entryId);
    if (!entry) return err(new HourEntryNotFoundError(command.entryId));

    const canDecide = await this.authority.canDecide(command.actor.userId, command.actorRole, entry);
    if (!canDecide) return err(new ForbiddenError('No puedes aprobar este registro.', 'HOUR_ENTRY_CANNOT_APPROVE'));

    const result = entry.approve(command.actor.userId, this.clock.now());
    if (result.isErr()) return err(result.error);

    await this.entries.save(entry);

    if (entry.projectId) {
      const usedHours = await this.entries.sumApprovedHoursForProject(entry.projectId);
      await this.projects.recalculateUsedHours(entry.projectId, usedHours);
    }

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'hour_entry',
      entityId: entry.id,
      changes: { status: { before: 'pending', after: 'approved' } },
    });

    return ok(undefined);
  }
}
