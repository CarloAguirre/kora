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

/** Base común de las 3 alertas de facturación/Hito 0 de proyecto — a Gerencia y líder PMO. */
interface ProjectBillingAlertBase {
  readonly recipientEmail: string;
  readonly recipientFirstName: string;
  readonly projectId: string;
  readonly projectName: string;
}

/** "Este proyecto aún no está Aprobado" — quien intentó facturar ya vio el error en pantalla; esto es el aviso aparte a Gerencia/PMO. */
export type ProjectInvoiceBlockedNotification = ProjectBillingAlertBase;

/** El proyecto pasó a Activo automáticamente al facturar el primer tramo (Hito 0). */
export type ProjectAutoActivatedNotification = ProjectBillingAlertBase;

/** Un proyecto `Detenido` se reactivó a Activo al facturar el primer tramo — "alerta de confirmación" del documento. */
export type ProjectReactivatedFromHoldNotification = ProjectBillingAlertBase;

export interface NotificationSender {
  sendUserInvitation(invitation: UserInvitation): Promise<void>;
  sendPasswordReset(notification: PasswordResetNotification): Promise<void>;
  sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void>;
  sendProjectInvoiceBlocked(notification: ProjectInvoiceBlockedNotification): Promise<void>;
  sendProjectAutoActivated(notification: ProjectAutoActivatedNotification): Promise<void>;
  sendProjectReactivatedFromHold(notification: ProjectReactivatedFromHoldNotification): Promise<void>;
}

export const NOTIFICATION_SENDER = Symbol('NotificationSender');
