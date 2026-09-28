import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { IssueProjectPaymentMilestoneInvoiceInput } from '@kora/contracts';
import {
  ProjectNotApprovedForInvoicingError,
  ProjectPaymentMilestoneAlreadyIssuedError,
  ProjectPaymentMilestoneNotFoundError,
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
import { PROJECT_USER_READER, type ProjectUserReader } from '../ports/project-user-reader.port';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { NOTIFICATION_SENDER, type NotificationSender } from '../../../../shared/application/ports/notification.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface IssueProjectPaymentMilestoneInvoiceCommand {
  readonly milestoneId: string;
  readonly data: IssueProjectPaymentMilestoneInvoiceInput;
  readonly actor: ActorContext;
}

/**
 * Registra que un tramo ya fue facturado — igual criterio que
 * `MarkSupportInvoiceIssuedUseCase`: Kora no emite la factura, solo folio y
 * fecha. El adjunto es solo el nombre del archivo (sin Storage todavía).
 *
 * Si es el primer tramo del proyecto (el de `sortOrder` más bajo) de un
 * proyecto `aprobado`, dispara Hito 0: activa el proyecto (interruptor
 * global en `true`, sin pausa pedida) o lo deja pendiente de aprobación de
 * Gerencia — si venía `on_hold`, en cambio, lo reactiva directamente (sin
 * pasar por el interruptor: el documento no condiciona la reactivación a
 * Gerencia, solo pide una alerta de confirmación) sin tocar la fecha de
 * Hito 0 original. Decisión de negocio del 2026-09-24 (antes disparaba al
 * PAGAR el tramo, no al facturarlo — ver `MarkProjectPaymentMilestonePaidUseCase`).
 */
@Injectable()
export class IssueProjectPaymentMilestoneInvoiceUseCase
  implements UseCase<IssueProjectPaymentMilestoneInvoiceCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_BILLING_SETTINGS_REPOSITORY) private readonly billingSettings: ProjectBillingSettingsRepository,
    @Inject(PROJECT_USER_READER) private readonly users: ProjectUserReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    private readonly changeLog: ProjectChangeLogRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Gerencia + líder PMO — destinatarios de las 3 alertas de este caso de uso. */
  private async notifyAdminTier(send: (recipient: { email: string; firstName: string }) => Promise<void>): Promise<void> {
    const recipients = await this.users.findActiveAdminTierRecipients();
    await Promise.all(
      recipients.map((recipient) => send({ email: recipient.email, firstName: recipient.fullName.split(' ')[0] ?? recipient.fullName })),
    );
  }

  async execute(command: IssueProjectPaymentMilestoneInvoiceCommand): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone) return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    if (milestone.status !== 'pending') return err(new ProjectPaymentMilestoneAlreadyIssuedError());

    const project = await this.projects.findById(milestone.projectId);
    if (project && !project.isDeleted && project.type === 'development' && project.salesStage !== 'approved') {
      await this.notifyAdminTier((recipient) =>
        this.notifications.sendProjectInvoiceBlocked({
          recipientEmail: recipient.email,
          recipientFirstName: recipient.firstName,
          projectId: project.id,
          projectName: project.name,
        }),
      );
      return err(new ProjectNotApprovedForInvoicingError());
    }

    const now = this.clock.now();
    const issuedAt = new Date(command.data.issuedAt);

    const siblings = await this.milestones.listForProject(milestone.projectId);
    const minSortOrder = Math.min(...siblings.map((sibling) => sibling.sortOrder));
    const isFirstMilestone = milestone.sortOrder === minSortOrder;

    const triggersNewHito0 = Boolean(
      isFirstMilestone && project && !project.isDeleted && project.salesStage === 'approved' && project.status === 'draft',
    );
    const triggersReactivation = Boolean(
      isFirstMilestone && project && !project.isDeleted && project.salesStage === 'approved' && project.status === 'on_hold',
    );

    let hito0Outcome: 'activated' | 'pending_approval' | 'reactivated' | null = null;

    await this.unitOfWork.run(async (tx) => {
      await this.milestones.markIssued(
        command.milestoneId,
        { invoiceNumber: command.data.folio, issuedAt },
        tx,
      );

      if (triggersNewHito0 && project) {
        const settings = await this.billingSettings.get(tx);
        if (settings.autoActivateFirstPayment && !command.data.pauseForManagementApproval) {
          project.activateFromHito0(now, 'auto_invoice', null);
          hito0Outcome = 'activated';
        } else {
          project.pauseForManagementApproval(now);
          hito0Outcome = 'pending_approval';
        }
        await this.projects.save(project, tx);
        await this.changeLog.record(
          [
            {
              projectId: project.id,
              message:
                hito0Outcome === 'activated'
                  ? `Proyecto activado automáticamente (Hito 0) al facturar el primer tramo (folio ${command.data.folio}) — comienzan a correr las horas.`
                  : `Primer tramo facturado (folio ${command.data.folio}) — Hito 0 pendiente de activación por Gerencia.`,
            },
          ],
          command.actor.userId,
          now,
          tx,
        );
      } else if (triggersReactivation && project) {
        project.changeStatus('active', now);
        hito0Outcome = 'reactivated';
        await this.projects.save(project, tx);
        await this.changeLog.record(
          [
            {
              projectId: project.id,
              message: `Proyecto reactivado de "Detenido" a "Activo" al facturar el primer tramo (folio ${command.data.folio}).`,
            },
          ],
          command.actor.userId,
          now,
          tx,
        );
      }
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: milestone.projectId,
      metadata: { event: 'payment_milestone_issued', milestoneId: command.milestoneId, folio: command.data.folio, hito0: hito0Outcome },
    });

    if (project && hito0Outcome === 'activated') {
      await this.notifyAdminTier((recipient) =>
        this.notifications.sendProjectAutoActivated({
          recipientEmail: recipient.email,
          recipientFirstName: recipient.firstName,
          projectId: project.id,
          projectName: project.name,
        }),
      );
    } else if (project && hito0Outcome === 'reactivated') {
      await this.notifyAdminTier((recipient) =>
        this.notifications.sendProjectReactivatedFromHold({
          recipientEmail: recipient.email,
          recipientFirstName: recipient.firstName,
          projectId: project.id,
          projectName: project.name,
        }),
      );
    }

    return ok(undefined);
  }
}
