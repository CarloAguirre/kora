import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
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
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_BILLING_SETTINGS_REPOSITORY,
  type ProjectBillingSettingsRepository,
} from '../../domain/repositories/project-billing-settings.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface MarkProjectPaymentMilestonePaidCommand {
  readonly milestoneId: string;
  readonly data: MarkProjectPaymentMilestonePaidInput;
  readonly actor: ActorContext;
}

/**
 * Registra el pago de un tramo — y, si es el primer tramo del proyecto (el
 * de `sortOrder` más bajo) y el proyecto está `aprobado`/todavía no activo,
 * dispara Hito 0: activa el proyecto automáticamente (interruptor global en
 * `true`, sin pausa pedida) o lo deja pendiente de aprobación de Gerencia.
 */
@Injectable()
export class MarkProjectPaymentMilestonePaidUseCase
  implements UseCase<MarkProjectPaymentMilestonePaidCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_BILLING_SETTINGS_REPOSITORY) private readonly billingSettings: ProjectBillingSettingsRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: MarkProjectPaymentMilestonePaidCommand): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone) return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    if (milestone.status === 'paid') return err(new ProjectPaymentMilestoneAlreadyPaidError());
    if (milestone.status !== 'invoiced') return err(new ProjectPaymentMilestoneNotIssuedError());

    const now = this.clock.now();
    const paidAt = new Date(command.data.paidAt);

    const siblings = await this.milestones.listForProject(milestone.projectId);
    const minSortOrder = Math.min(...siblings.map((sibling) => sibling.sortOrder));
    const isFirstMilestone = milestone.sortOrder === minSortOrder;

    const project = isFirstMilestone ? await this.projects.findById(milestone.projectId) : null;
    const triggersHito0 = project && !project.isDeleted && project.salesStage === 'approved' && project.status === 'draft';

    let hito0Outcome: 'activated' | 'pending_approval' | null = null;

    await this.unitOfWork.run(async (tx) => {
      await this.milestones.markPaid(command.milestoneId, paidAt, tx);

      if (triggersHito0 && project) {
        const settings = await this.billingSettings.get(tx);
        if (settings.autoActivateFirstPayment && !command.data.pauseForManagementApproval) {
          project.activateFromFirstPayment(now);
          hito0Outcome = 'activated';
        } else {
          project.pauseForManagementApproval(now);
          hito0Outcome = 'pending_approval';
        }
        await this.projects.save(project, tx);
      }
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: milestone.projectId,
      metadata: { event: 'payment_milestone_paid', milestoneId: command.milestoneId, hito0: hito0Outcome },
    });

    return ok(undefined);
  }
}
