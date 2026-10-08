import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { CreateProjectPaymentMilestoneInput, Permission } from '@kora/contracts';
import { CannotManageProjectError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { PaymentMilestoneTriggerService } from '../services/payment-milestone-trigger.service';
import { toPaymentMilestoneSchedule } from '../services/payment-plan-sync';

export interface CreateProjectPaymentMilestoneCommand {
  readonly projectId: string;
  readonly data: CreateProjectPaymentMilestoneInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Configurar el cronograma de cobro de un proyecto — decisión de PM/PMO o del líder DE ESE PROYECTO.
 * Marcar un tramo como facturado/pagado sigue siendo exclusivo de Finanzas (`billing:manage`), ver
 * `IssueProjectPaymentMilestoneInvoiceUseCase`/`MarkProjectPaymentMilestonePaidUseCase`.
 */
@Injectable()
export class CreateProjectPaymentMilestoneUseCase
  implements UseCase<CreateProjectPaymentMilestoneCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly paymentTriggers: PaymentMilestoneTriggerService,
  ) {}

  async execute(
    command: CreateProjectPaymentMilestoneCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    const id = await this.milestones.create({ projectId: project.id, ...toPaymentMilestoneSchedule(command.data, 0) });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'payment_milestone_created', milestoneId: id },
    });

    // Un tramo nuevo cuyo hito ya se cumplió (proyecto aprobado, fase alcanzada, fecha pasada) queda por facturar.
    await this.paymentTriggers.promoteAndNotify(project);

    return ok({ id });
  }
}
