import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, type Clock, type TransactionContext, type UnitOfWork } from '@kora/core';
import { PROJECT_PHASES, PROJECT_PHASE_LABELS, type ProjectPhase } from '@kora/contracts';
import type { Project } from '../../domain/entities/project.entity';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRecord,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { PROJECT_CLIENT_READER, type ProjectClientReader } from '../ports/project-client-reader.port';
import { PROJECT_USER_READER, type ProjectUserReader } from '../ports/project-user-reader.port';
import { NOTIFICATION_SENDER, type NotificationSender } from '../../../../shared/application/ports/notification.port';
import { progressToday } from './project-progress';

/** Tramo que acaba de pasar a "Por facturar" — lo que hace falta para avisar. */
export interface PromotedPaymentMilestone {
  readonly milestone: ProjectPaymentMilestoneRecord;
  /** Qué hito se cumplió, ya redactado para el correo. */
  readonly reason: string;
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const phaseRank = (phase: ProjectPhase): number => PROJECT_PHASES.indexOf(phase);
const formatDay = (date: Date): string => isoDate(date).split('-').reverse().join('-');

/**
 * Por qué el tramo ya está por facturar, o `null` si su hito todavía no se cumple. Solo aplica a tramos
 * `pending` con monto: un tramo en 0 (el cronograma por defecto sin completar) no tiene nada que facturar
 * — se evalúa de nuevo cuando se le cargue el monto. `today` es el día en hora de Chile (`progressToday`).
 */
export function paymentMilestoneReadyReason(
  milestone: ProjectPaymentMilestoneRecord,
  project: Pick<Project, 'salesStage' | 'phase' | 'status' | 'isDeleted'>,
  today: string,
): string | null {
  if (milestone.status !== 'pending' || milestone.amount <= 0 || project.isDeleted) return null;

  switch (milestone.triggerType) {
    case 'approval':
      return project.salesStage === 'approved' ? 'el proyecto fue aprobado' : null;
    case 'phase':
      if (!milestone.triggerPhase) return null;
      if (project.phase && phaseRank(project.phase) >= phaseRank(milestone.triggerPhase)) {
        return `el proyecto llegó a la fase ${PROJECT_PHASE_LABELS[milestone.triggerPhase]}`;
      }
      // Un proyecto finalizado ya pasó por todas sus fases, aunque no se haya actualizado la fase.
      return project.status === 'finished' ? 'el proyecto finalizó' : null;
    case 'date':
      return milestone.triggerDate && isoDate(milestone.triggerDate) <= today
        ? `llegó su fecha de cobro (${formatDay(milestone.triggerDate)})`
        : null;
    case 'manual':
      return null;
  }
}

/**
 * Pasa a "Por facturar" los tramos `pending` de un proyecto cuyo hito ya se cumplió (aprobación, fase o
 * fecha) y avisa por correo a Finanzas y Gerencia/PMO.
 *
 * Kora no tiene jobs recurrentes, así que se evalúa cuando cambia algo que puede cumplir un hito (crear o
 * editar el proyecto o sus tramos, o cambiarle el estado) y, para los tramos por fecha, de forma perezosa al leer — mismo criterio
 * que `SupportMonthlyPeriodReconciler`: ver `reconcileDueDates`.
 *
 * `promote` corre dentro de la transacción del cambio; `notify` va después del commit, para no avisar de
 * algo que terminó en rollback.
 */
@Injectable()
export class PaymentMilestoneTriggerService {
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_CLIENT_READER) private readonly clients: ProjectClientReader,
    @Inject(PROJECT_USER_READER) private readonly users: ProjectUserReader,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** ¿El hito del tramo ya se cumplió, hoy y con el estado actual del proyecto? (como si estuviera `pending`) */
  readinessOf(project: Project): (milestone: ProjectPaymentMilestoneRecord) => boolean {
    const today = progressToday(this.clock.now());
    return (milestone) => paymentMilestoneReadyReason({ ...milestone, status: 'pending' }, project, today) !== null;
  }

  async promote(project: Project, context?: TransactionContext): Promise<PromotedPaymentMilestone[]> {
    if (project.type !== 'development') return [];
    const today = progressToday(this.clock.now());

    const promoted: PromotedPaymentMilestone[] = [];
    for (const milestone of await this.milestones.listForProject(project.id, context)) {
      const reason = paymentMilestoneReadyReason(milestone, project, today);
      // Condicional: si otra lectura concurrente ya lo promovió, no se vuelve a avisar.
      if (!reason || !(await this.milestones.markToInvoice(milestone.id, context))) continue;
      promoted.push({ milestone, reason });
    }
    return promoted;
  }

  /** Aviso best-effort: un correo que falla no deshace el cambio de estado (el sender ya deja el error en el log). */
  async notify(project: Project, promoted: readonly PromotedPaymentMilestone[]): Promise<void> {
    if (promoted.length === 0) return;

    const [recipients, client] = await Promise.all([
      this.users.findActiveBillingRecipients(),
      project.clientId ? this.clients.findById(project.clientId) : Promise.resolve(null),
    ]);
    const snapshot = project.toSnapshot();

    await Promise.all(
      recipients.flatMap((recipient) =>
        promoted.map(async ({ milestone, reason }) => {
          try {
            await this.notifications.sendProjectPaymentMilestoneReady({
              recipientEmail: recipient.email,
              recipientFirstName: recipient.fullName.split(' ')[0] ?? recipient.fullName,
              projectId: project.id,
              projectName: project.name,
              clientName: client?.companyName ?? null,
              milestoneName: milestone.name,
              percent: milestone.percent,
              amount: milestone.amount,
              currency: snapshot.contractCurrency,
              reason,
            });
          } catch {
            // Ver comentario del método.
          }
        }),
      ),
    );
  }

  /** `promote` + `notify` en su propia transacción — para los cambios que no tienen una transacción abierta. */
  async promoteAndNotify(project: Project): Promise<void> {
    const promoted = await this.unitOfWork.run((tx) => this.promote(project, tx));
    await this.notify(project, promoted);
  }

  /**
   * Tramos por fecha cuya fecha ya llegó, de todos los proyectos — se llama al leer el libro de
   * Facturación y la ficha del proyecto (no hay cron que lo haga a la hora).
   */
  async reconcileDueDates(): Promise<void> {
    const today = progressToday(this.clock.now());
    const due = await this.milestones.listPendingDateTriggered(today);
    const projectIds = [...new Set(due.map((milestone) => milestone.projectId))];

    for (const projectId of projectIds) {
      const project = await this.projects.findById(projectId);
      if (project) await this.promoteAndNotify(project);
    }
  }
}
