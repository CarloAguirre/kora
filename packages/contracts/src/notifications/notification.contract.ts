import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from '../common/primitives';

/**
 * Notificaciones dentro de Kora (campanita de la barra superior). Cada tipo
 * define su propio `data`; el cliente decide cómo pintarlo según `type`.
 */

export const TEAM_REPORT_MISSING_FIELDS = ['assigned_hours', 'dates'] as const;
export const teamReportMissingFieldSchema = z.enum(TEAM_REPORT_MISSING_FIELDS);
export type TeamReportMissingField = z.infer<typeof teamReportMissingFieldSchema>;

export const TEAM_REPORT_MISSING_FIELD_LABELS: Readonly<Record<TeamReportMissingField, string>> = {
  assigned_hours: 'sin HH asignadas',
  dates: 'sin fechas',
};

/**
 * Qué le falta cargar al Líder PM de un proyecto para el reporte de UN equipo.
 * Solo aplica a proyectos —no prospectos— donde ese equipo ya registró horas
 * (aprobadas o por aprobar): sin eso, ni fechas ni HH asignadas le sirven al
 * reporte. Es el único criterio: lo usan el Reporte de equipo, "Pedir datos a
 * los Líderes PM" y los pendientes de la campanita.
 */
export function teamReportMissingFields(
  project: {
    readonly salesStage: string | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
    /** HH asignadas a ese equipo (`project_teams.assigned_hours`). */
    readonly assignedHours: number | null;
  },
  teamHasHours: boolean,
): TeamReportMissingField[] {
  if (project.salesStage === 'prospect' || !teamHasHours) return [];
  const missing: TeamReportMissingField[] = [];
  if (!project.assignedHours) missing.push('assigned_hours');
  if (!project.startDate || !project.endDate) missing.push('dates');
  return missing;
}

/** "Pedir datos a los Líderes PM" del Reporte de equipo — una notificación por Líder PM con todos sus proyectos. */
export const teamReportDataRequestDataSchema = z.object({
  teamId: uuidSchema,
  teamName: z.string(),
  requestedBy: z.object({ id: uuidSchema, fullName: z.string() }),
  note: z.string().nullable(),
  items: z.array(
    z.object({
      projectId: uuidSchema,
      projectSlug: z.string(),
      projectName: z.string(),
      clientName: z.string().nullable(),
      missing: z.array(teamReportMissingFieldSchema),
    }),
  ),
});
export type TeamReportDataRequestData = z.infer<typeof teamReportDataRequestDataSchema>;

export const notificationSchema = z.discriminatedUnion('type', [
  z.object({
    id: uuidSchema,
    type: z.literal('team_report_data_request'),
    title: z.string(),
    data: teamReportDataRequestDataSchema,
    readAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
  }),
]);
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationType = Notification['type'];

export const listNotificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int(),
});
export type ListNotificationsResponse = z.infer<typeof listNotificationsResponseSchema>;

/**
 * Pendientes del líder que la campanita calcula en vivo (`GET /reminders/me`).
 * No se guardan ni se marcan como leídos: desaparecen solos al resolverse.
 * Para quien no tiene el rol de líder todo viene vacío.
 */
export const leaderRemindersSchema = z.object({
  /** Registros de horas de otros que le toca decidir — mismo alcance que su cola de aprobación, sin los propios. */
  pendingApprovals: z.object({ entries: z.number().int(), hours: z.number() }),
  /** Días hábiles recientes (sin contar hoy) con menos de 8 h registradas — mismo criterio que el correo de las 18:00. */
  missingHourDays: z.array(z.object({ date: z.string(), hoursRegistered: z.number() })),
  /** Proyectos que lidera (Líder PM) con datos por completar — ver `teamReportMissingFields`. */
  projectsMissingData: z.array(
    z.object({
      projectId: uuidSchema,
      projectSlug: z.string(),
      projectName: z.string(),
      clientName: z.string().nullable(),
      missingDates: z.boolean(),
      /** Equipos que ya registraron horas en el proyecto y no tienen HH asignadas. */
      teamsWithoutAssignedHours: z.array(z.string()),
    }),
  ),
});
export type LeaderReminders = z.infer<typeof leaderRemindersSchema>;
