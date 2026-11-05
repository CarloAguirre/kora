import { Inject, Injectable } from '@nestjs/common';
import { eq, projects, users, type Database } from '@kora/db';
import { LOGGER, type Logger } from '@kora/core';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import {
  NOTIFICATION_INBOX, type NotificationInbox,
} from '../../../notifications/application/ports/notification-inbox.port';
import {
  NOTIFICATION_SENDER, type NotificationSender,
} from '../../../../shared/application/ports/notification.port';

export interface ProjectTaskReviewEvent {
  readonly kind: 'review_requested' | 'returned';
  readonly projectId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly taskName: string;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly projectLeaderUserId: string | null;
  readonly actorUserId: string;
  readonly reason: string | null;
}

/**
 * Los avisos se publican después de confirmar el cambio de estado; una falla
 * de correo NO deshace una aprobación/devolución ya persistida.
 * Las devoluciones envían correo inmediato. Si falla, el buzón sin emailedAt
 * permite el reintento automático de respaldo. Las solicitudes a aprobar se
 * entregan primero en la campanita (correo a las 48h si no se abren).
 */
@Injectable()
export class ProjectTaskReviewNotifier {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(NOTIFICATION_INBOX) private readonly inbox: NotificationInbox,
    @Inject(NOTIFICATION_SENDER) private readonly sender: NotificationSender,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async publish(event: ProjectTaskReviewEvent): Promise<void> {
    const recipientId = event.kind === 'review_requested'
      ? event.projectLeaderUserId : event.assigneeUserId;
    if (!recipientId || recipientId === event.actorUserId) return;
    try {
      const [project] = await this.db.select({
        name: projects.name, slug: projects.slug,
      }).from(projects).where(eq(projects.id, event.projectId)).limit(1);
      const [recipient] = await this.db.select({
        firstName: users.firstName, email: users.email,
      }).from(users).where(eq(users.id, recipientId)).limit(1);
      if (!project || !recipient) return;
      const type = event.kind === 'returned' ? 'task_returned' : 'task_review_requested';
      const data = {
        projectId: event.projectId,
        projectSlug: project.slug,
        projectName: project.name,
        moduleId: event.moduleId,
        taskId: event.taskId,
        taskName: event.taskName,
        assigneeName: event.assigneeName,
        reason: event.reason,
      };
      let emailedAt: Date | null = null;
      if (event.kind === 'returned') {
        try {
          await this.sender.sendProjectTaskStatus({
            recipientEmail: recipient.email,
            recipientFirstName: recipient.firstName,
            kind: event.kind,
            projectName: project.name,
            projectSlug: project.slug,
            taskName: event.taskName,
            assigneeName: event.assigneeName,
            reason: event.reason,
          });
          emailedAt = new Date();
        } catch (error) {
          this.logger.error('[tareas] Correo de devolución fallido; queda reintento de respaldo', {
            taskId: event.taskId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await this.inbox.create({
        userId: recipientId, type,
        title: event.kind === 'returned'
          ? 'Tarea devuelta para correcciones'
          : 'Tarea completada pendiente de aprobación',
        data, createdByUserId: event.actorUserId,
        ...(emailedAt ? { emailedAt } : {}),
      });
    } catch (error) {
      this.logger.error('[tareas] No se pudo registrar la notificación de revisión', {
        taskId: event.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
