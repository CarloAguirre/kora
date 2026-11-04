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

/**
 * Un tramo de pago pasó a "Por facturar" porque el proyecto cumplió su hito
 * (aprobación, cambio de fase o fecha programada) — a Finanzas y Gerencia/PMO.
 */
export interface ProjectPaymentMilestoneReadyNotification extends ProjectBillingAlertBase {
  readonly clientName: string | null;
  readonly milestoneName: string;
  readonly percent: number | null;
  readonly amount: number;
  readonly currency: 'UF' | 'CLP' | 'USD';
  /** Qué hito se cumplió, ya redactado: "el proyecto fue aprobado", "el proyecto entró en Marcha blanca"… */
  readonly reason: string;
}

/** Un día hábil en que el usuario no completó su jornada. */
export interface MissingHoursDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly hoursRegistered: number;
}

/**
 * Recordatorio diario (18:00 Chile) a quien registra horas y tiene días hábiles
 * recientes bajo la jornada — ver `SendMissingHoursRemindersUseCase`.
 */
export interface MissingHoursReminderNotification {
  readonly recipientEmail: string;
  readonly recipientFirstName: string;
  readonly expectedHoursPerDay: number;
  /** Todos los días incompletos, en cualquier orden; la plantilla decide cuántos mostrar. */
  readonly days: readonly MissingHoursDay[];
}

export interface PendingHoursDigestItem {
  readonly kind: 'project' | 'no_project' | 'ticket';
  readonly ownerFullName: string;
  /** Proyecto, "Ticket · Proyecto" o la asignación de una hora sin proyecto (Vacaciones, Capacitación...). */
  readonly label: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly hours: number;
  readonly daysPending: number;
}

/** Resumen diario (08:00 Chile) a cada aprobador con horas esperando su decisión. */
export interface PendingHoursDigestNotification {
  readonly recipientEmail: string;
  readonly recipientFirstName: string;
  readonly items: readonly PendingHoursDigestItem[];
}

export interface SupportBillingDigestItem {
  readonly clientName: string;
  readonly planName: string;
  /** Ya redactado: "Mensual · acumulado", "Mensual · con vencimiento", "Bolsa", "A demanda". */
  readonly contractType: string;
  /** HH aprobadas del contrato en el mes que termina. */
  readonly usedHours: number;
  /** HH del mes aún por aprobar — no entran en `usedHours` ni en el cobro hasta que se aprueben. */
  readonly pendingHours: number;
}

/** Resumen de fin de mes (último día hábil) a admin/PMO: los contratos de soporte activos que hay que cobrar. */
export interface SupportBillingDigestNotification {
  readonly recipientEmail: string;
  readonly recipientFirstName: string;
  /** "octubre de 2026". */
  readonly monthLabel: string;
  readonly items: readonly SupportBillingDigestItem[];
}

/**
 * Correo de respaldo de "Pedir datos a los Líderes PM" (Reporte de equipo): sale
 * cuando el Líder PM no abrió la notificación en Kora dentro de 48 h.
 */
export interface TeamReportDataRequestEmail {
  readonly recipientEmail: string;
  readonly recipientFirstName: string;
  readonly requestedByName: string;
  readonly teamName: string;
  readonly note: string | null;
  readonly items: ReadonlyArray<{
    readonly projectSlug: string;
    readonly projectName: string;
    readonly clientName: string | null;
    /** Ya redactado: "sin fechas", "sin HH asignadas y sin fechas". */
    readonly missing: string;
  }>;
}

export interface NotificationSender {
  sendUserInvitation(invitation: UserInvitation): Promise<void>;
  sendPasswordReset(notification: PasswordResetNotification): Promise<void>;
  sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void>;
  sendProjectInvoiceBlocked(notification: ProjectInvoiceBlockedNotification): Promise<void>;
  sendProjectAutoActivated(notification: ProjectAutoActivatedNotification): Promise<void>;
  sendProjectReactivatedFromHold(notification: ProjectReactivatedFromHoldNotification): Promise<void>;
  sendProjectPaymentMilestoneReady(notification: ProjectPaymentMilestoneReadyNotification): Promise<void>;
  sendMissingHoursReminder(notification: MissingHoursReminderNotification): Promise<void>;
  sendPendingHoursDigest(notification: PendingHoursDigestNotification): Promise<void>;
  sendSupportBillingDigest(notification: SupportBillingDigestNotification): Promise<void>;
  sendTeamReportDataRequest(notification: TeamReportDataRequestEmail): Promise<void>;
}

export const NOTIFICATION_SENDER = Symbol('NotificationSender');
