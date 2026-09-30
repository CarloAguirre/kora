import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission, UpdateProjectPaymentMilestoneInput } from '@kora/contracts';
import {
  CannotManageProjectError,
  InvalidProjectPaymentMilestoneStateError,
  ProjectNotFoundError,
  ProjectPaymentMilestoneNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectPaymentMilestoneCommand {
  readonly projectId: string;
  readonly milestoneId: string;
  readonly data: UpdateProjectPaymentMilestoneInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

const toDate = (value: string | null | undefined): Date | null => (value ? new Date(value) : null);

/**
 * Editar un tramo es una corrección manual: cualquier campo, en cualquier estado,
 * incluido el propio estado (p.ej. devolver un tramo facturado por error a
 * "Pendiente"). No dispara Hito 0 — eso sigue siendo exclusivo de
 * `IssueProjectPaymentMilestoneInvoiceUseCase`. Al volver a "Pendiente" se
 * limpian folio y fechas; al volver a "Facturado", la fecha de pago.
 */
@Injectable()
export class UpdateProjectPaymentMilestoneUseCase
  implements UseCase<UpdateProjectPaymentMilestoneCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateProjectPaymentMilestoneCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone || milestone.projectId !== project.id) {
      return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    }
    const { data } = command;
    const status = data.status ?? milestone.status;
    const invoiceNumber =
      status === 'pending' ? null : data.invoiceNumber !== undefined ? data.invoiceNumber || null : milestone.invoiceNumber;
    const issuedAt =
      status === 'pending' ? null : data.issuedAt !== undefined ? toDate(data.issuedAt) : milestone.issuedAt;
    const paidAt = status !== 'paid' ? null : data.paidAt !== undefined ? toDate(data.paidAt) : milestone.paidAt;

    if (status !== 'pending' && (!invoiceNumber || !issuedAt)) {
      return err(new InvalidProjectPaymentMilestoneStateError('Un tramo facturado o pagado necesita folio y fecha de emisión.'));
    }
    if (status === 'paid' && !paidAt) {
      return err(new InvalidProjectPaymentMilestoneStateError('Un tramo pagado necesita la fecha de pago.'));
    }

    await this.milestones.update(command.milestoneId, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.percent !== undefined ? { percent: data.percent } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      status,
      invoiceNumber,
      issuedAt,
      paidAt,
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: {
        event: 'payment_milestone_updated',
        milestoneId: command.milestoneId,
        ...(status !== milestone.status ? { statusFrom: milestone.status, statusTo: status } : {}),
      },
    });

    return ok(undefined);
  }
}
