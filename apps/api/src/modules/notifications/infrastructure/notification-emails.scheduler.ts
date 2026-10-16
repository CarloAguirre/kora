import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LOGGER, type Logger } from '@kora/core';
import { SendOverdueNotificationEmailsUseCase } from '../application/use-cases/send-overdue-notification-emails.use-case';

/**
 * Revisa cada hora las notificaciones sin abrir con más de 48 h y manda el correo
 * de respaldo. No necesita `scheduled_job_runs`: cada notificación se reclama con
 * un `update … where emailed_at is null`, así que dos instancias no duplican correos.
 * `ScheduleModule.forRoot()` ya lo registra `RemindersModule`.
 */
@Injectable()
export class NotificationEmailsScheduler {
  constructor(
    private readonly sendOverdue: SendOverdueNotificationEmailsUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'notification-email-fallback' })
  async run(): Promise<void> {
    try {
      const { sent, failed } = (await this.sendOverdue.execute()).unwrap();
      if (sent > 0 || failed > 0) this.logger.info('[notificaciones] Correos de respaldo enviados', { sent, failed });
    } catch (error) {
      this.logger.error('[notificaciones] Falló el envío de correos de respaldo', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
