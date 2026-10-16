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
