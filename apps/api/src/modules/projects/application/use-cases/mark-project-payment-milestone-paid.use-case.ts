import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { MarkProjectPaymentMilestonePaidInput } from '@kora/contracts';
import {
  ProjectPaymentMilestoneAlreadyPaidError,
  ProjectPaymentMilestoneNotFoundError,
  ProjectPaymentMilestoneNotIssuedError,
} from '../../domain/errors/project.errors';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface MarkProjectPaymentMilestonePaidCommand {
  readonly milestoneId: string;
  readonly data: MarkProjectPaymentMilestonePaidInput;
  readonly actor: ActorContext;
}

/**
 * Registra el pago de un tramo. Ya no dispara Hito 0 — el kickoff se dispara
 * al FACTURAR el primer tramo, no al pagarlo (ver
 * `IssueProjectPaymentMilestoneInvoiceUseCase`; decisión de negocio del
 * 2026-09-24, KORA · Definiciones de tipos, estados, activación y horas de
 * proyecto).
 */
@Injectable()
export class MarkProjectPaymentMilestonePaidUseCase
  implements UseCase<MarkProjectPaymentMilestonePaidCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: MarkProjectPaymentMilestonePaidCommand): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone) return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    if (milestone.status === 'paid') return err(new ProjectPaymentMilestoneAlreadyPaidError());
    if (milestone.status !== 'invoiced') return err(new ProjectPaymentMilestoneNotIssuedError());

    const paidAt = new Date(command.data.paidAt);
    await this.milestones.markPaid(command.milestoneId, paidAt);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: milestone.projectId,
      metadata: { event: 'payment_milestone_paid', milestoneId: command.milestoneId },
    });

    return ok(undefined);
  }
}
