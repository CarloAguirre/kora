import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import { HourEntryNotFoundError, HourEntryOutsideCurrentMonthError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import { isInCurrentMonth } from '../services/hour-entry-edit-window';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteHourEntryCommand {
  readonly entryId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * El dueño o un admin/PMO borran un registro pendiente o rechazado. Uno aprobado
 * ya cuenta en el consumo del proyecto: solo lo borra quien puede aprobarlo
 * (incluye admin/PMO), y el consumo se recalcula sin él. Salvo admin/PMO (que
 * eliminan cualquier registro), solo dentro del mes en curso.
 */
@Injectable()
export class DeleteHourEntryUseCase implements UseCase<DeleteHourEntryCommand, void, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    private readonly authority: HourEntryApprovalAuthorityService,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteHourEntryCommand): Promise<Result<void, ApplicationError>> {
    const { entryId, actor, actorRole } = command;
    const entry = await this.entries.findById(entryId);
    if (!entry) return err(new HourEntryNotFoundError(entryId));

    const isOwner = entry.userId === actor.userId;
    const isAdminLike = actorRole === 'admin' || actorRole === 'pmo';
    const wasApproved = entry.status === 'approved';
    const canDelete = wasApproved
      ? await this.authority.canDecide(actor.userId, actorRole, entry)
      : isOwner || isAdminLike;
    if (!canDelete) {
      return err(new ForbiddenError('No puedes eliminar este registro.', 'HOUR_ENTRY_CANNOT_DELETE'));
    }
    if (!isAdminLike && !isInCurrentMonth(entry.date, this.clock.now())) return err(new HourEntryOutsideCurrentMonthError());

    await this.entries.delete(entryId);

    if (wasApproved && entry.projectId) {
      const usedHours = await this.entries.sumApprovedHoursForProject(entry.projectId);
      await this.projects.recalculateUsedHours(entry.projectId, usedHours);
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'delete',
      entityType: 'hour_entry',
      entityId: entryId,
    });

    return ok(undefined);
  }
}
