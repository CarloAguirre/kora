/**
 * Lecturas que necesitan los recordatorios de horas. Son consultas de lote
 * (todo el plantel, todas las horas pendientes) que ningún repositorio de
 * Horas ofrece, por eso viven en un puerto propio de solo lectura.
 */

export interface ReminderRecipient {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly fullName: string;
}

export interface HoursRegistrant extends ReminderRecipient {
  /** Fecha (`YYYY-MM-DD`) de su primer registro de horas; `null` si nunca registró. */
  readonly firstEntryDate: string | null;
}

export interface DailyHours {
  readonly userId: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly hours: number;
}

export interface PendingHourEntryRow {
  readonly id: string;
  readonly ownerUserId: string;
  readonly ownerFullName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly assignment: string | null;
  readonly designatedApproverUserId: string | null;
  /** Código visible del ticket (`TK-0001`) si la hora nació de una solicitud de HH de ticket. */
  readonly ticketCode: string | null;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly hours: number;
  readonly createdAt: Date;
}

export interface HourReminderReader {
  /** Usuarios activos cuyo rol tiene `hours:register` (mismo criterio que Disponibilidad). */
  findHoursRegistrants(): Promise<HoursRegistrant[]>;

  /** Fecha (`YYYY-MM-DD`) del primer registro de horas de una persona — mismo cálculo que `firstEntryDate`. */
  findFirstEntryDate(userId: string): Promise<string | null>;

  /**
   * Horas registradas por usuario y día entre `from` y `to` (incluidos), en
   * cualquier estado — una hora rechazada igual es tiempo registrado, como en
   * la v1 —, más las solicitudes de HH de ticket que no tienen `hour_entries`
   * (rechazadas antes de que existiera ese vínculo).
   */
  sumDailyHours(userIds: readonly string[], from: string, to: string): Promise<DailyHours[]>;

  /** Feriados nacionales de Chile no laborables entre `from` y `to`. */
  findHolidays(from: string, to: string): Promise<string[]>;

  /** Horas pendientes de aprobación de usuarios activos, sin las de tickets borrados. */
  findPendingHourEntries(): Promise<PendingHourEntryRow[]>;

  /**
   * Quienes lideran algún equipo activo del que `memberUserId` es miembro —
   * mismo criterio ampliado que `TeamRepository.isTeamLeaderOfMember` (líder
   * oficial del equipo o líder de un proyecto asignado a ese equipo).
   */
  findTeamLeaderIdsForMember(memberUserId: string): Promise<string[]>;

  /** Solo los activos y no borrados: a una cuenta deshabilitada no se le escribe. */
  findActiveUsersByIds(userIds: readonly string[]): Promise<ReminderRecipient[]>;
}

export const HOUR_REMINDER_READER = Symbol('HourReminderReader');
