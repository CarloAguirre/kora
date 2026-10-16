import type { Notification, NotificationType } from '@kora/contracts';

export interface CreateNotificationInput {
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly data: Notification['data'];
  readonly createdByUserId: string | null;
}

/** Notificación sin abrir que ya cumplió el plazo para el correo de respaldo. */
export interface OverdueNotification {
  readonly id: string;
  readonly recipientEmail: string;
  readonly recipientFirstName: string;
  readonly notification: Notification;
}

/**
 * Buzón de notificaciones de Kora. Lo exporta `NotificationsModule` para que
 * cualquier módulo pueda dejar avisos sin conocer la tabla.
 */
export interface NotificationInbox {
  create(input: CreateNotificationInput): Promise<void>;
  listForUser(userId: string, limit: number): Promise<{ items: Notification[]; unreadCount: number }>;
  markRead(userId: string, notificationId: string, now: Date): Promise<void>;
  markAllRead(userId: string, now: Date): Promise<void>;
  /**
   * Marca como enviadas por correo (y devuelve) las notificaciones sin leer creadas
   * antes de `createdBefore`. La marca va primero para que dos instancias no
   * manden el mismo correo; si el envío falla se libera con `releaseEmailClaim`.
   */
  claimOverdueForEmail(createdBefore: Date, now: Date): Promise<OverdueNotification[]>;
  releaseEmailClaim(notificationId: string): Promise<void>;
}

export const NOTIFICATION_INBOX = Symbol('NotificationInbox');
