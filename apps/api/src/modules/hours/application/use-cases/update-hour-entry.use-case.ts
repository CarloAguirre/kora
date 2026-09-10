import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { RoleCode, UpdateHourEntryInput } from '@kora/contracts';
import { HourEntryNotFoundError, InvalidDesignatedApproverError, ProjectStoppedError, ReferencedProjectNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_USER_READER, type HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateHourEntryCommand {
  readonly entryId: string;
  readonly data: UpdateHourEntryInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/** Solo el dueño (mientras esté pendiente/rechazado) o un admin/PMO pueden editar. */
@Injectable()
export class UpdateHourEntryUseCase implements UseCase<UpdateHourEntryCommand, void, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_USER_READER) private readonly users: HourEntryUserReader,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateHourEntryCommand): Promise<Result<void, ApplicationError>> {
    const { entryId, data, actor, actorRole } = command;
    const entry = await this.entries.findById(entryId);
    if (!entry) return err(new HourEntryNotFoundError(entryId));

    const isOwner = entry.userId === actor.userId;
    if (!isOwner && actorRole !== 'admin' && actorRole !== 'pmo') {
      return err(new ForbiddenError('No puedes editar este registro.', 'HOUR_ENTRY_CANNOT_EDIT'));
    }

    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));
      if (project.status === 'on_hold') return err(new ProjectStoppedError());
    }

    if (data.designatedApproverUserId) {
      const approver = await this.users.findById(data.designatedApproverUserId);
      if (!approver || approver.role !== 'leader' || approver.status !== 'active') {
        return err(new InvalidDesignatedApproverError());
      }
    }

    const owner = await this.users.findById(entry.userId);
    const isOvertime = data.isOvertime !== undefined ? data.isOvertime : entry.isOvertime;
    // Horas extra siempre exigen aprobación de líder, aunque el rol del dueño no la requiera.
    const ownerRequiresApproval = owner?.role === 'collaborator' || isOvertime;

    const result = entry.updateDetails(
      {
        assignment: data.assignment,
        projectId: data.projectId === undefined ? undefined : data.projectId,
        category: data.category,
        description: data.description,
        hours: data.hours,
        date: data.date ? new Date(data.date) : undefined,
        isOvertime: data.isOvertime,
        designatedApproverUserId: data.designatedApproverUserId === undefined ? undefined : data.designatedApproverUserId,
      },
      ownerRequiresApproval,
      this.clock.now(),
    );
    if (result.isErr()) return err(result.error);

    await this.entries.save(entry);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'hour_entry',
      entityId: entry.id,
    });

    return ok(undefined);
  }
}
