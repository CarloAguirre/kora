import type { Logger } from '@kora/core';
import type {
  AccountStatusNotification,
  MissingHoursReminderNotification,
  NotificationSender,
  PasswordResetNotification,
  PendingHoursDigestNotification,
  ProjectAutoActivatedNotification,
  ProjectInvoiceBlockedNotification,
  ProjectPaymentMilestoneReadyNotification,
  ProjectReactivatedFromHoldNotification,
  SupportBillingDigestNotification,
  TeamReportDataRequestEmail,
  UserInvitation,
} from '../../application/ports/notification.port';

/**
 * Implementación de desarrollo: escribe la notificación en el log en lugar de
 * enviarla.
 *
 * Permite trabajar en todo el flujo de altas e invitaciones sin un servidor de
 * correo configurado —el enlace aparece en la consola y se puede pegar en el
 * navegador—. Cuando haya proveedor real, se escribe otro adaptador que
 * implemente el mismo puerto y se cambia una línea en el módulo: ningún caso de
 * uso se entera.
 *
 * Se usa cuando no hay `RESEND_API_KEY`. En producción la clave es obligatoria
 * (ver `assertProductionSafety` en env.schema), así que esta clase nunca llega
 * a registrarse allí.
 */
export class LogNotificationSender implements NotificationSender {
  constructor(
    private readonly logger: Logger,
    private readonly webAppUrl: string,
  ) {}

  async sendUserInvitation(invitation: UserInvitation): Promise<void> {
    this.logger.info('[notificación] Invitación de usuario', {
      to: invitation.email,
      firstName: invitation.firstName,
      invitedBy: invitation.invitedByName,
      expiresAt: invitation.expiresAt.toISOString(),
      // El token va explícito a propósito: es lo que hace usable este adaptador
      // en desarrollo. Por eso mismo no puede activarse en producción.
      link: `${this.webAppUrl}/definir-contrasena?token=${invitation.setPasswordToken}`,
    });
  }

  async sendPasswordReset(notification: PasswordResetNotification): Promise<void> {
    this.logger.info('[notificación] Recuperación de contraseña', {
      to: notification.email,
      expiresAt: notification.expiresAt.toISOString(),
      link: `${this.webAppUrl}/definir-contrasena?token=${notification.resetToken}`,
    });
  }

  async sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void> {
    this.logger.info('[notificación] Cambio de estado de cuenta', {
      to: notification.email,
      status: notification.status,
      reason: notification.reason ?? null,
    });
  }

  async sendProjectInvoiceBlocked(notification: ProjectInvoiceBlockedNotification): Promise<void> {
    this.logger.info('[notificación] Factura bloqueada: proyecto no está Aprobado', {
      to: notification.recipientEmail,
      projectId: notification.projectId,
      projectName: notification.projectName,
    });
  }

  async sendProjectAutoActivated(notification: ProjectAutoActivatedNotification): Promise<void> {
    this.logger.info('[notificación] Proyecto activado automáticamente (Hito 0)', {
      to: notification.recipientEmail,
      projectId: notification.projectId,
      projectName: notification.projectName,
    });
  }

  async sendProjectReactivatedFromHold(notification: ProjectReactivatedFromHoldNotification): Promise<void> {
    this.logger.info('[notificación] Proyecto reactivado desde Detenido', {
      to: notification.recipientEmail,
      projectId: notification.projectId,
      projectName: notification.projectName,
    });
  }

  async sendProjectPaymentMilestoneReady(notification: ProjectPaymentMilestoneReadyNotification): Promise<void> {
    this.logger.info('[notificación] Tramo de pago por facturar', {
      to: notification.recipientEmail,
      projectId: notification.projectId,
      projectName: notification.projectName,
      milestoneName: notification.milestoneName,
      amount: notification.amount,
      currency: notification.currency,
      reason: notification.reason,
    });
  }

  async sendMissingHoursReminder(notification: MissingHoursReminderNotification): Promise<void> {
    this.logger.info('[notificación] Recordatorio de horas sin registrar', {
      to: notification.recipientEmail,
      days: notification.days.map((day) => `${day.date} (${day.hoursRegistered}h)`),
    });
  }

  async sendPendingHoursDigest(notification: PendingHoursDigestNotification): Promise<void> {
    this.logger.info('[notificación] Resumen de horas por aprobar', {
      to: notification.recipientEmail,
      items: notification.items.length,
      hours: notification.items.reduce((sum, item) => sum + item.hours, 0),
    });
  }

  async sendSupportBillingDigest(notification: SupportBillingDigestNotification): Promise<void> {
    this.logger.info('[notificación] Resumen de soportes por cobrar', {
      to: notification.recipientEmail,
      month: notification.monthLabel,
      items: notification.items.map((item) => `${item.clientName} · ${item.contractType} · ${item.usedHours}h`),
    });
  }

  async sendTeamReportDataRequest(notification: TeamReportDataRequestEmail): Promise<void> {
    this.logger.info('[notificación] Solicitud de datos del reporte de equipo', {
      to: notification.recipientEmail,
      requestedBy: notification.requestedByName,
      projects: notification.items.length,
    });
  }
}
