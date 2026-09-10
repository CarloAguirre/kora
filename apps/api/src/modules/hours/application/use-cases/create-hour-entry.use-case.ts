import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import type { CreateHourEntryInput, RoleCode } from '@kora/contracts';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import { InvalidDesignatedApproverError, ProjectStoppedError, ReferencedProjectNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_USER_READER, type HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateHourEntryCommand {
  readonly data: CreateHourEntryInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Alta de un registro de horas.
 *
 * `admin`/`comercial` no pueden registrar horas propias — igual que en la v1
 * (`rls_can_register_hh`) — así que solo se permite crear a nombre de otra
 * persona, y solo si esa persona sí puede registrar.
 */
@Injectable()
export class CreateHourEntryUseCase implements UseCase<CreateHourEntryCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_USER_READER) private readonly users: HourEntryUserReader,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateHourEntryCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor, actorRole } = command;
    const ownerId = data.userId ?? actor.userId;

    if (ownerId === actor.userId) {
      if (actorRole === 'admin' || actorRole === 'commercial') {
        return err(new ForbiddenError('Este rol no registra horas propias.', 'HOUR_ENTRY_ROLE_CANNOT_REGISTER'));
      }
    } else if (actorRole !== 'admin' && actorRole !== 'pmo' && actorRole !== 'leader') {
      return err(new ForbiddenError('No puedes registrar horas a nombre de otra persona.', 'HOUR_ENTRY_CANNOT_REGISTER_FOR_OTHERS'));
    }

    const owner = await this.users.findById(ownerId);
    if (!owner) return err(new ForbiddenError('El usuario indicado no existe.', 'HOUR_ENTRY_OWNER_NOT_FOUND'));
    // Horas extra siempre exigen aprobación de líder, aunque el rol del dueño no la requiera.
    const ownerRequiresApproval = owner.role === 'collaborator' || data.isOvertime;

    let projectStageAtEntry: string | null = null;
    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));
      if (project.status === 'on_hold') return err(new ProjectStoppedError());
      projectStageAtEntry = project.status;
    }

    if (data.designatedApproverUserId) {
      const approver = await this.users.findById(data.designatedApproverUserId);
      if (!approver || approver.role !== 'leader' || approver.status !== 'active') {
        return err(new InvalidDesignatedApproverError());
      }
    }

    const created = HourEntry.create({
      id: this.ids.generate(),
      userId: ownerId,
      projectId: data.projectId ?? null,
      assignment: data.assignment,
      category: data.category,
      description: data.description,
      hours: data.hours,
      date: new Date(data.date),
      isOvertime: data.isOvertime,
      projectStageAtEntry,
      designatedApproverUserId: data.designatedApproverUserId ?? null,
      ownerRequiresApproval,
      now: this.clock.now(),
    });
    if (created.isErr()) return err(created.error);
    const entry = created.value;

    await this.entries.save(entry);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'hour_entry',
      entityId: entry.id,
      metadata: { ownerId, assignment: data.assignment, hours: data.hours, status: entry.status },
    });

    return ok({ id: entry.id });
  }
}
