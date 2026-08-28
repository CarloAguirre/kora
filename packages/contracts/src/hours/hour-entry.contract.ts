import { z } from 'zod';
import { isoDateTimeSchema, nonEmptyTrimmed, pageSchema, paginationQuerySchema, sortDirectionSchema, uuidSchema } from '../common/primitives';
import { roleCodeSchema } from '../users/roles';

/** Ver docs/DECISION-M4-HORAS.md. */

export const HOUR_ENTRY_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const hourEntryStatusSchema = z.enum(HOUR_ENTRY_STATUSES);
export type HourEntryStatus = z.infer<typeof hourEntryStatusSchema>;

export const HOUR_ENTRY_STATUS_LABELS: Readonly<Record<HourEntryStatus, string>> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

/**
 * Conjunto vigente de "asignación" para altas nuevas. La v1 acumula valores
 * históricos fuera de este conjunto (p.ej. 'Soporte', 'Apoyo Interno',
 * 'Ticket-IN0529') que siguen siendo válidos para lectura — por eso el campo
 * persiste como texto libre y esta validación aplica solo al crear.
 */
export const HOUR_ENTRY_ASSIGNMENTS = [
  'Proyecto',
  'Prospecto',
  'Vacaciones',
  'Día Administrativo',
  'Día de Cumpleaños',
  'Licencia Médica',
  'Capacitación',
  'Sin asignación',
] as const;
export const hourEntryAssignmentSchema = z.enum(HOUR_ENTRY_ASSIGNMENTS);
export type HourEntryAssignment = z.infer<typeof hourEntryAssignmentSchema>;

/** Asignaciones que requieren seleccionar un proyecto. */
export const PROJECT_REQUIRING_ASSIGNMENTS: ReadonlySet<string> = new Set(['Proyecto', 'Prospecto']);

export const hourEntrySummarySchema = z.object({
  id: uuidSchema,
  user: z.object({ id: uuidSchema, fullName: z.string() }),
  project: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  /** Equipo activo del autor del registro al momento de listarlo (no se guarda histórico). */
  team: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  assignment: z.string().nullable(),
  category: z.string(),
  description: z.string(),
  hours: z.number(),
  date: z.string(),
  isOvertime: z.boolean(),
  status: hourEntryStatusSchema,
  rejectionReason: z.string().nullable(),
  designatedApprover: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  createdAt: isoDateTimeSchema,
});
export type HourEntrySummary = z.infer<typeof hourEntrySummarySchema>;

export const hourEntryDetailSchema = hourEntrySummarySchema.extend({
  projectStageAtEntry: z.string().nullable(),
  decisionBy: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  decisionAt: isoDateTimeSchema.nullable(),
  legacyId: uuidSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type HourEntryDetail = z.infer<typeof hourEntryDetailSchema>;

export const createHourEntrySchema = z
  .object({
    userId: uuidSchema.optional(),
    projectId: uuidSchema.nullish(),
    assignment: hourEntryAssignmentSchema,
    category: z.string().trim().max(300).optional(),
    description: z.string().trim().max(2000).optional(),
    hours: z.coerce.number().positive('Las horas deben ser mayores a 0.').max(24, 'No puede registrar más de 24 horas en un día.'),
    date: z.iso.date(),
    isOvertime: z.boolean().default(false),
    designatedApproverUserId: uuidSchema.nullish(),
  })
  .refine((data) => !PROJECT_REQUIRING_ASSIGNMENTS.has(data.assignment) || Boolean(data.projectId), {
    message: 'Selecciona un proyecto para esta asignación.',
    path: ['projectId'],
  })
  .refine((data) => PROJECT_REQUIRING_ASSIGNMENTS.has(data.assignment) || !data.projectId, {
    message: 'Esta asignación no admite proyecto.',
    path: ['projectId'],
  });
export type CreateHourEntryInput = z.infer<typeof createHourEntrySchema>;

export const updateHourEntrySchema = z.object({
  assignment: hourEntryAssignmentSchema.optional(),
  projectId: uuidSchema.nullish(),
  category: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  hours: z.coerce.number().positive().max(24).optional(),
  date: z.iso.date().optional(),
  isOvertime: z.boolean().optional(),
  designatedApproverUserId: uuidSchema.nullish(),
});
export type UpdateHourEntryInput = z.infer<typeof updateHourEntrySchema>;

export const rejectHourEntrySchema = z.object({ reason: nonEmptyTrimmed(500, 'El motivo de rechazo') });
export type RejectHourEntryInput = z.infer<typeof rejectHourEntrySchema>;

export const hourEntrySortFieldSchema = z.enum(['date', 'createdAt', 'status', 'hours']);
export type HourEntrySortField = z.infer<typeof hourEntrySortFieldSchema>;

export const listHourEntriesQuerySchema = paginationQuerySchema.extend({
  userId: uuidSchema.optional(),
  /** Filtra por nombre del autor — historial de equipo del líder ("Registro de horas Líder" en la v1). */
  search: z.string().trim().max(120).optional(),
  projectId: uuidSchema.optional(),
  status: hourEntryStatusSchema.optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  sortField: hourEntrySortFieldSchema.default('date'),
  sortDirection: sortDirectionSchema.default('desc'),
});
export type ListHourEntriesQuery = z.infer<typeof listHourEntriesQuerySchema>;

export const listHourEntriesResponseSchema = pageSchema(hourEntrySummarySchema);
export type ListHourEntriesResponse = z.infer<typeof listHourEntriesResponseSchema>;

export const HOLIDAY_TYPES = ['national', 'regional', 'company'] as const;
export const holidayTypeSchema = z.enum(HOLIDAY_TYPES);
export type HolidayType = z.infer<typeof holidayTypeSchema>;

export const holidaySchema = z.object({
  id: uuidSchema,
  date: z.string(),
  name: z.string(),
  type: holidayTypeSchema,
  isWorkingDay: z.boolean(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const listHolidaysQuerySchema = z.object({
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});
export type ListHolidaysQuery = z.infer<typeof listHolidaysQuerySchema>;

/**
 * Reporte de "Capacity" (pestaña de Administración, ver la v1
 * `Usuarios/index.tsx`, pestaña `capacity`): horas *aprobadas* de un mes,
 * una fila por registro, con el % de dedicación mensual del colaborador.
 * Requiere `hours:read_all` — ve todas las horas de la organización.
 */
export const capacityReportRowSchema = z.object({
  id: uuidSchema,
  supervisorFullName: z.string(),
  collaboratorFullName: z.string(),
  /** Fecha del registro (ISO `yyyy-mm-dd`) — el front deriva de aquí las columnas "Mes" y "Periodo". */
  periodDate: z.string(),
  clientName: z.string(),
  projectName: z.string(),
  type: z.string(),
  dedicatedHours: z.number(),
  dedicatedDays: z.number(),
  dedicationPercent: z.number(),
  /** `yyyy-mm` del registro — agrupación mensual usada por el % de dedicación. */
  monthKey: z.string(),
});
export type CapacityReportRow = z.infer<typeof capacityReportRowSchema>;

export const capacityReportSortFieldSchema = z.enum([
  'supervisorFullName',
  'collaboratorFullName',
  'periodDate',
  'clientName',
  'projectName',
  'type',
  'dedicatedHours',
  'dedicatedDays',
  'dedicationPercent',
]);
export type CapacityReportSortField = z.infer<typeof capacityReportSortFieldSchema>;

export const listCapacityReportQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  /** Cualquier día del mes a reportar; se normaliza al primer día del mes. */
  periodStart: z.iso.date(),
  sortField: capacityReportSortFieldSchema.default('periodDate'),
  sortDirection: sortDirectionSchema.default('desc'),
});
export type ListCapacityReportQuery = z.infer<typeof listCapacityReportQuerySchema>;

export const listCapacityReportResponseSchema = pageSchema(capacityReportRowSchema);
export type ListCapacityReportResponse = z.infer<typeof listCapacityReportResponseSchema>;

/**
 * "Registro de Horas" / Disponibilidad (pestaña de Administración, ver la v1
 * `Usuarios/index.tsx`, pestaña `registro-horas`): horas registradas por
 * usuario habilitado y fecha, para pintar una grilla usuario × día/semana.
 * Requiere `hours:read_all`.
 */
export const availabilityUserRowSchema = z.object({
  userId: uuidSchema,
  fullName: z.string(),
  email: z.string(),
  role: roleCodeSchema,
  teamName: z.string().nullable(),
});
export type AvailabilityUserRow = z.infer<typeof availabilityUserRowSchema>;

export const availabilityRoleFilterSchema = z.enum(['admin', 'collaborator', 'leader']);
export type AvailabilityRoleFilter = z.infer<typeof availabilityRoleFilterSchema>;

export const availabilityQuerySchema = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  search: z.string().trim().max(120).optional(),
  role: availabilityRoleFilterSchema.optional(),
  teamId: uuidSchema.optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilityResponseSchema = z.object({
  users: z.array(availabilityUserRowSchema),
  /** Horas aprobadas por celda, clave `"<userId>:<isoDate>"`. */
  hoursByUserAndDate: z.record(z.string(), z.number()),
  /** Horas pendientes+aprobadas por celda, misma clave — alimenta el filtro "semana incompleta". */
  registeredHoursByUserAndDate: z.record(z.string(), z.number()),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
