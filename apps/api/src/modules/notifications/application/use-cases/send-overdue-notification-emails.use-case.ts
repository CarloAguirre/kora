import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, LOGGER, ok, type Clock, type Logger, type Result } from '@kora/core';
import { TEAM_REPORT_MISSING_FIELD_LABELS } from '@kora/contracts';
import { NOTIFICATION_SENDER, type NotificationSender } from '../../../../shared/application/ports/notification.port';
import { NOTIFICATION_INBOX, type NotificationInbox, type OverdueNotification } from '../ports/notification-inbox.port';
import type { UseCase } from '../../../../shared/application/use-case';

/** Plazo para abrir la notificación en Kora antes de que salga el correo. */
export const EMAIL_FALLBACK_AFTER_MS = 48 * 60 * 60 * 1000;

export interface SendOverdueNotificationEmailsResult {
  readonly sent: number;
  readonly failed: number;
}

/** Correo de respaldo para las notificaciones que nadie abrió en 48 h — ver `NotificationEmailsScheduler`. */
@Injectable()
export class SendOverdueNotificationEmailsUseCase implements UseCase<void, SendOverdueNotificationEmailsResult, never> {
  constructor(
    @Inject(NOTIFICATION_INBOX) private readonly inbox: NotificationInbox,
    @Inject(NOTIFICATION_SENDER) private readonly sender: NotificationSender,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute(): Promise<Result<SendOverdueNotificationEmailsResult, never>> {
    const now = this.clock.now();
    const overdue = await this.inbox.claimOverdueForEmail(new Date(now.getTime() - EMAIL_FALLBACK_AFTER_MS), now);
    let sent = 0;
    let failed = 0;
    for (const item of overdue) {
      try {
        await this.send(item);
        sent++;
      } catch (error) {
        failed++;
        await this.inbox.releaseEmailClaim(item.id);
        this.logger.error('[notificaciones] No se pudo enviar el correo de respaldo', {
          notificationId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return ok({ sent, failed });
  }

  private send({ notification, recipientEmail, recipientFirstName }: OverdueNotification): Promise<void> {
    switch (notification.type) {
      case 'team_report_data_request':
        return this.sender.sendTeamReportDataRequest({
          recipientEmail,
          recipientFirstName,
          requestedByName: notification.data.requestedBy.fullName,
          teamName: notification.data.teamName,
          note: notification.data.note,
          items: notification.data.items.map((item) => ({
            projectSlug: item.projectSlug,
            projectName: item.projectName,
            clientName: item.clientName,
            missing: item.missing.map((field) => TEAM_REPORT_MISSING_FIELD_LABELS[field]).join(' y '),
          })),
        });
    }
  }
}
