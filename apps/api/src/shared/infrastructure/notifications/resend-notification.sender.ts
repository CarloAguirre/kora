import type { Logger } from '@kora/core';
import type { Resend } from 'resend';
import type { MailSettings } from '../../../config/app-config.service';
import type {
  AccountStatusNotification,
  NotificationSender,
  PasswordResetNotification,
  ProjectAutoActivatedNotification,
  ProjectInvoiceBlockedNotification,
  ProjectReactivatedFromHoldNotification,
  UserInvitation,
} from '../../application/ports/notification.port';
import {
  renderAccountStatusChanged,
  renderPasswordReset,
  renderProjectAutoActivated,
  renderProjectInvoiceBlocked,
  renderProjectReactivatedFromHold,
  renderUserInvitation,
  type RenderedEmail,
} from './email-templates';

/** La parte del SDK que se usa: permite probar el adaptador sin red. */
export type ResendEmailsClient = Pick<Resend['emails'], 'send'>;

export class NotificationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}

/**
 * Envía las notificaciones por Resend (dominio `kora-correos.online`, el mismo
 * que usa Kora v1, con una API key propia de v2).
 *
 * El SDK no lanza: devuelve `{ data, error }`. Aquí se convierte el error en
 * excepción porque es el contrato que esperan los casos de uso —los que tratan
 * el aviso como opcional ya lo envuelven en try/catch—.
 *
 * No se registra el cuerpo ni los enlaces: llevan tokens de un solo uso.
 */
export class ResendNotificationSender implements NotificationSender {
  constructor(
    private readonly emails: ResendEmailsClient,
    private readonly settings: MailSettings,
    private readonly logger: Logger,
  ) {}

  sendUserInvitation(invitation: UserInvitation): Promise<void> {
    return this.deliver('user_invitation', invitation.email, renderUserInvitation(invitation, this.settings.webAppUrl));
  }

  sendPasswordReset(notification: PasswordResetNotification): Promise<void> {
    return this.deliver('password_reset', notification.email, renderPasswordReset(notification, this.settings.webAppUrl));
  }

  sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void> {
    return this.deliver(
      'account_status_changed',
      notification.email,
      renderAccountStatusChanged(notification, this.settings.webAppUrl),
    );
  }

  sendProjectInvoiceBlocked(notification: ProjectInvoiceBlockedNotification): Promise<void> {
    return this.deliver(
      'project_invoice_blocked',
      notification.recipientEmail,
      renderProjectInvoiceBlocked(notification, this.settings.webAppUrl),
    );
  }

  sendProjectAutoActivated(notification: ProjectAutoActivatedNotification): Promise<void> {
    return this.deliver(
      'project_auto_activated',
      notification.recipientEmail,
      renderProjectAutoActivated(notification, this.settings.webAppUrl),
    );
  }

  sendProjectReactivatedFromHold(notification: ProjectReactivatedFromHoldNotification): Promise<void> {
    return this.deliver(
      'project_reactivated_from_hold',
      notification.recipientEmail,
      renderProjectReactivatedFromHold(notification, this.settings.webAppUrl),
    );
  }

  private async deliver(kind: string, to: string, email: RenderedEmail): Promise<void> {
    const redirectTo = this.settings.redirectTo;
    const recipient = redirectTo ?? to;
    const subject = redirectTo ? `[para ${to}] ${email.subject}` : email.subject;

    const { data, error } = await this.emails.send({
      from: this.settings.from,
      to: recipient,
      subject,
      html: email.html,
      text: email.text,
      // Etiquetas visibles en el panel de Resend: separan los envíos de v2 de los de v1.
      tags: [
        { name: 'app', value: 'kora2' },
        { name: 'kind', value: kind },
      ],
    });

    if (error) {
      this.logger.error('[notificación] Resend rechazó el envío', {
        kind,
        to: recipient,
        error: error.message,
        errorName: error.name,
      });
      throw new NotificationDeliveryError(`No se pudo enviar el correo (${kind}): ${error.message}`);
    }

    this.logger.info('[notificación] Correo enviado', {
      kind,
      to: recipient,
      ...(redirectTo ? { originalTo: to } : {}),
      resendId: data?.id ?? null,
    });
  }
}
