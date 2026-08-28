import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, type Logger } from '@kora/core';
import type {
  AccountStatusNotification,
  NotificationSender,
  PasswordResetNotification,
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
 * En producción esta clase NO debe registrarse; el arranque falla si lo hace.
 */
@Injectable()
export class LogNotificationSender implements NotificationSender {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  async sendUserInvitation(invitation: UserInvitation): Promise<void> {
    this.logger.info('[notificación] Invitación de usuario', {
      to: invitation.email,
      firstName: invitation.firstName,
      invitedBy: invitation.invitedByName,
      expiresAt: invitation.expiresAt.toISOString(),
      // El token va explícito a propósito: es lo que hace usable este adaptador
      // en desarrollo. Por eso mismo no puede activarse en producción.
      link: `/auth/definir-contrasena?token=${invitation.setPasswordToken}`,
    });
  }

  async sendPasswordReset(notification: PasswordResetNotification): Promise<void> {
    this.logger.info('[notificación] Recuperación de contraseña', {
      to: notification.email,
      expiresAt: notification.expiresAt.toISOString(),
      link: `/auth/restablecer?token=${notification.resetToken}`,
    });
  }

  async sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void> {
    this.logger.info('[notificación] Cambio de estado de cuenta', {
      to: notification.email,
      status: notification.status,
      reason: notification.reason ?? null,
    });
  }
}
