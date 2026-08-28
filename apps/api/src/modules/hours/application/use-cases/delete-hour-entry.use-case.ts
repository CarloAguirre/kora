import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import { HourEntryNotEditableError, HourEntryNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteHourEntryCommand {
  readonly entryId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/** Solo se puede borrar un registro pendiente — uno aprobado ya afectó el consumo del proyecto. */
@Injectable()
export class DeleteHourEntryUseCase implements UseCase<DeleteHourEntryCommand, void, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: DeleteHourEntryCommand): Promise<Result<void, ApplicationError>> {
    const { entryId, actor, actorRole } = command;
    const entry = await this.entries.findById(entryId);
    if (!entry) return err(new HourEntryNotFoundError(entryId));

    const isOwner = entry.userId === actor.userId;
    if (!isOwner && actorRole !== 'admin' && actorRole !== 'pmo') {
      return err(new ForbiddenError('No puedes eliminar este registro.', 'HOUR_ENTRY_CANNOT_DELETE'));
    }
    if (entry.status === 'approved') return err(new HourEntryNotEditableError());

    await this.entries.delete(entryId);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'delete',
      entityType: 'hour_entry',
      entityId: entryId,
    });

    return ok(undefined);
  }
}
