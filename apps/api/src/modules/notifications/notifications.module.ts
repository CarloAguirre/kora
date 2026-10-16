import { Module } from '@nestjs/common';
import { NotificationsController } from './presentation/notifications.controller';
import { ListNotificationsUseCase } from './application/use-cases/list-notifications.use-case';
import { MarkNotificationsReadUseCase } from './application/use-cases/mark-notifications-read.use-case';
import { SendOverdueNotificationEmailsUseCase } from './application/use-cases/send-overdue-notification-emails.use-case';
import { NOTIFICATION_INBOX } from './application/ports/notification-inbox.port';
import { DrizzleNotificationInbox } from './infrastructure/drizzle-notification-inbox';
import { NotificationEmailsScheduler } from './infrastructure/notification-emails.scheduler';

/**
 * Notificaciones dentro de Kora (campanita). Exporta `NOTIFICATION_INBOX` para
 * que otros módulos dejen avisos — hoy, "Pedir datos a los Líderes PM" del
 * Reporte de equipo (`TeamsModule`).
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    ListNotificationsUseCase,
    MarkNotificationsReadUseCase,
    SendOverdueNotificationEmailsUseCase,
    NotificationEmailsScheduler,
    { provide: NOTIFICATION_INBOX, useClass: DrizzleNotificationInbox },
  ],
  exports: [NOTIFICATION_INBOX],
})
export class NotificationsModule {}
