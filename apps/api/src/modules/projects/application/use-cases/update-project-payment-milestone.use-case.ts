import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { PROJECT_PAYMENT_DEFAULT_TERM_DAYS, type Permission, type UpdateProjectPaymentMilestoneInput } from '@kora/contracts';
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
import { PaymentMilestoneTriggerService } from '../services/payment-milestone-trigger.service';
import { paymentScheduleChanged } from '../services/payment-plan-sync';
import { addDays } from '../services/payment-milestone-overdue';

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
 * `IssueProjectPaymentMilestoneInvoiceUseCase`. Al volver a "Pendiente"/"Por
 * facturar" se limpian folio y fechas; al volver a "Facturado", la fecha de pago.
 *
 * Sin estado explícito, el estado lo decide el hito: si cambió el monto o el hito
 * de un tramo "Por facturar" que ya no lo cumple, vuelve a "Pendiente"; y uno
 * "Pendiente" que ahora lo cumple pasa a "Por facturar" (con aviso).
 */
@Injectable()
export class UpdateProjectPaymentMilestoneUseCase
  implements UseCase<UpdateProjectPaymentMilestoneCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly paymentTriggers: PaymentMilestoneTriggerService,
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
    const triggerType = data.triggerType ?? milestone.triggerType;
    const schedule = {
      name: data.name ?? milestone.name,
      percent: data.percent !== undefined ? (data.percent ?? null) : milestone.percent,
      amount: data.amount ?? milestone.amount,
      sortOrder: data.sortOrder ?? milestone.sortOrder,
      triggerType,
      triggerPhase:
        triggerType !== 'phase' ? null : data.triggerPhase !== undefined ? (data.triggerPhase ?? null) : milestone.triggerPhase,
      triggerDate:
        triggerType !== 'date' ? null : data.triggerDate !== undefined ? toDate(data.triggerDate) : milestone.triggerDate,
    };
    if (triggerType === 'phase' && !schedule.triggerPhase) {
      return err(new InvalidProjectPaymentMilestoneStateError('Selecciona la fase que activa el tramo.'));
    }
    if (triggerType === 'date' && !schedule.triggerDate) {
      return err(new InvalidProjectPaymentMilestoneStateError('Indica la fecha en que se cobra el tramo.'));
    }

    const demote =
      data.status === undefined &&
      milestone.status === 'to_invoice' &&
      paymentScheduleChanged(milestone, schedule) &&
      !this.paymentTriggers.readinessOf(project)({ ...milestone, ...schedule });
    const status = data.status ?? (demote ? 'pending' : milestone.status);
    const notInvoiced = status === 'pending' || status === 'to_invoice';
    const invoiceNumber = notInvoiced
      ? null
      : data.invoiceNumber !== undefined
        ? data.invoiceNumber || null
        : milestone.invoiceNumber;
    const issuedAt = notInvoiced ? null : data.issuedAt !== undefined ? toDate(data.issuedAt) : milestone.issuedAt;
    const dueAt = notInvoiced
      ? null
      : data.dueAt !== undefined
        ? toDate(data.dueAt)
        : (milestone.dueAt ?? (issuedAt ? addDays(issuedAt, PROJECT_PAYMENT_DEFAULT_TERM_DAYS) : null));
    const paidAt = status !== 'paid' ? null : data.paidAt !== undefined ? toDate(data.paidAt) : milestone.paidAt;

    if (!notInvoiced && (!invoiceNumber || !issuedAt)) {
      return err(new InvalidProjectPaymentMilestoneStateError('Un tramo facturado o pagado necesita folio y fecha de emisión.'));
    }
    if (status === 'paid' && !paidAt) {
      return err(new InvalidProjectPaymentMilestoneStateError('Un tramo pagado necesita la fecha de pago.'));
    }

    await this.milestones.update(command.milestoneId, {
      ...schedule,
      status,
      invoiceNumber,
      issuedAt,
      dueAt,
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

    if (data.status === undefined) await this.paymentTriggers.promoteAndNotify(project);

    return ok(undefined);
  }
}
