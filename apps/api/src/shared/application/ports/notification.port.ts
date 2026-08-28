/**
 * Puerto de notificaciones salientes.
 *
 * Se define en términos de intención de negocio ("invita a este usuario"), no
 * de mecanismo ("envía este HTML"). Así cambiar de proveedor de correo, o
 * añadir un canal, no toca ningún caso de uso.
 */

export interface UserInvitation {
  readonly email: string;
  readonly firstName: string;
  readonly invitedByName: string;
  readonly setPasswordToken: string;
  readonly expiresAt: Date;
}

export interface PasswordResetNotification {
  readonly email: string;
  readonly firstName: string;
  readonly resetToken: string;
  readonly expiresAt: Date;
}

export interface AccountStatusNotification {
  readonly email: string;
  readonly firstName: string;
  readonly status: 'active' | 'disabled' | 'blocked';
  readonly reason?: string | undefined;
}

export interface NotificationSender {
  sendUserInvitation(invitation: UserInvitation): Promise<void>;
  sendPasswordReset(notification: PasswordResetNotification): Promise<void>;
  sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void>;
}

export const NOTIFICATION_SENDER = Symbol('NotificationSender');
