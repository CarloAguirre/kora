import { z } from 'zod';
import { arrayQueryParam, isoDateTimeSchema, nonEmptyTrimmed, pageSchema, paginationQuerySchema, sortDirectionSchema, uuidSchema } from '../common/primitives';
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
  /** Fase/módulo contra la que se imputó la hora, si se eligió una. */
  module: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  assignment: z.string().nullable(),
  category: z.string(),
  description: z.string(),
  hours: z.number(),
  date: z.string(),
  isOvertime: z.boolean(),
  /** Bloqueo reportado al registrar la hora — visible para el líder en la Bitácora del proyecto. */
  hasBlocker: z.boolean(),
  blockerDescription: z.string().nullable(),
  /** Fase del proyecto en el momento del registro — "Estado" en la v1 (Activo/No iniciado/Detenido). Null si el registro no tiene proyecto. */
  projectStageAtEntry: z.string().nullable(),
  status: hourEntryStatusSchema,
  rejectionReason: z.string().nullable(),
  designatedApprover: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  /**
   * Quién puede aprobar este registro cuando es de proyecto: EXCLUYENTE — el
   * líder del propio equipo del autor si tiene uno resoluble para este
   * proyecto, y si no, el líder del proyecto (ver DECISION-M4-HORAS.md "Con
   * proyecto" — acotado al equipo del autor, no cualquier equipo asignado al
   * proyecto). En la práctica trae como mucho una persona; es un arreglo por
   * si el autor pertenece a más de un equipo asignado al proyecto. Vacío
   * para registros sin proyecto — ahí el aprobador es `designatedApprover`.
   */
  projectApprovers: z.array(z.object({ id: uuidSchema, fullName: z.string() })),
  /** Ticket de origen si este registro viene de una solicitud de HH de ticket (ver `TicketHhRequestSyncPort`), null si es un registro de horas normal. */
  ticket: z.object({ id: uuidSchema, legacyId: z.string().nullable() }).nullable(),
  createdAt: isoDateTimeSchema,
});
export type HourEntrySummary = z.infer<typeof hourEntrySummarySchema>;

export const hourEntryDetailSchema = hourEntrySummarySchema.extend({
  decisionBy: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  decisionAt: isoDateTimeSchema.nullable(),
  legacyId: uuidSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type HourEntryDetail = z.infer<typeof hourEntryDetailSchema>;

/** "Actividad" del registro: obligatoria al crear y, si se envía, al editar. */
const hourEntryCategorySchema = z.string().trim().min(1, 'Indica la actividad realizada.').max(300);

export const createHourEntrySchema = z
  .object({
    userId: uuidSchema.optional(),
    projectId: uuidSchema.nullish(),
    moduleId: uuidSchema.nullish(),
    assignment: hourEntryAssignmentSchema,
    category: hourEntryCategorySchema,
    description: z.string().trim().max(2000).optional(),
    hours: z.coerce.number().positive('Las horas deben ser mayores a 0.').max(24, 'No puede registrar más de 24 horas en un día.'),
    date: z.iso.date(),
    isOvertime: z.boolean().default(false),
    designatedApproverUserId: uuidSchema.nullish(),
    hasBlocker: z.boolean().default(false),
    blockerDescription: z.string().trim().max(1000).optional(),
  })
  .refine((data) => !PROJECT_REQUIRING_ASSIGNMENTS.has(data.assignment) || Boolean(data.projectId), {
    message: 'Selecciona un proyecto para esta asignación.',
    path: ['projectId'],
  })
  .refine((data) => PROJECT_REQUIRING_ASSIGNMENTS.has(data.assignment) || !data.projectId, {
    message: 'Esta asignación no admite proyecto.',
    path: ['projectId'],
  })
  .refine((data) => !data.moduleId || Boolean(data.projectId), {
    message: 'Selecciona un proyecto para elegir un módulo.',
    path: ['moduleId'],
  })
  .refine((data) => !data.hasBlocker || Boolean(data.blockerDescription?.trim()), {
    message: 'Describe el bloqueo.',
    path: ['blockerDescription'],
  });
export type CreateHourEntryInput = z.infer<typeof createHourEntrySchema>;

export const updateHourEntrySchema = z.object({
  assignment: hourEntryAssignmentSchema.optional(),
  projectId: uuidSchema.nullish(),
  moduleId: uuidSchema.nullish(),
  category: hourEntryCategorySchema.optional(),
  description: z.string().trim().max(2000).optional(),
  hours: z.coerce.number().positive().max(24).optional(),
  date: z.iso.date().optional(),
  isOvertime: z.boolean().optional(),
  designatedApproverUserId: uuidSchema.nullish(),
  hasBlocker: z.boolean().optional(),
  blockerDescription: z.string().trim().max(1000).optional(),
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
  /** Acota a los autores con membresía activa en este equipo, dentro del alcance de visibilidad ya resuelto. */
  teamId: uuidSchema.optional(),
  /** Acepta id o slug: la ficha de proyecto filtra por el `projectId` de la URL, que ahora es el slug del proyecto — se resuelve a UUID en `ListHourEntriesUseCase`. */
  projectId: z.string().optional(),
  /** Varios proyectos por UUID (filtro Proyecto del historial de equipo). */
  projectIds: arrayQueryParam(uuidSchema),
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

/** Tope del rango de Capacity: un año alcanza para cualquier revisión y acota cuántas horas se cargan en memoria. */
export const CAPACITY_REPORT_MAX_RANGE_DAYS = 366;

export const listCapacityReportQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(120).optional(),
    /** Rango de fechas del registro (inclusive), `yyyy-mm-dd`. Puede abarcar varios meses. */
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    sortField: capacityReportSortFieldSchema.default('periodDate'),
    sortDirection: sortDirectionSchema.default('desc'),
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
    path: ['dateTo'],
  })
  .refine(
    (data) => (Date.parse(data.dateTo) - Date.parse(data.dateFrom)) / 86_400_000 < CAPACITY_REPORT_MAX_RANGE_DAYS,
    { message: `El rango no puede superar ${CAPACITY_REPORT_MAX_RANGE_DAYS} días.`, path: ['dateTo'] },
  );
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

/**
 * Resumen de horas pendientes que quedaron con un líder de equipo (no con el
 * propio líder de proyecto) — ver `GetProjectPendingApprovalsUseCase` y
 * DECISION-M4-HORAS.md "Autoridad de aprobación". Solo lo ve el líder del
 * proyecto (o admin/pmo): es la forma en que se entera de que un líder de
 * equipo aún no ha decidido, sin poder aprobar/rechazar él mismo esas horas.
 */
export const projectPendingApprovalCollaboratorSchema = z.object({
  userId: uuidSchema,
  userName: z.string(),
  entryCount: z.number().int(),
  totalHours: z.number(),
  /** Fecha (ISO `yyyy-mm-dd`) del registro pendiente más antiguo de este colaborador. */
  oldestPendingDate: z.string(),
});
export type ProjectPendingApprovalCollaborator = z.infer<typeof projectPendingApprovalCollaboratorSchema>;

export const projectPendingApprovalGroupSchema = z.object({
  approverUserId: uuidSchema,
  approverName: z.string(),
  entryCount: z.number().int(),
  totalHours: z.number(),
  /** Fecha (ISO `yyyy-mm-dd`) del registro pendiente más antiguo del grupo. */
  oldestPendingDate: z.string(),
  /** De qué colaborador es cada tramo de lo pendiente — no solo el total del líder. */
  collaborators: z.array(projectPendingApprovalCollaboratorSchema),
});
export type ProjectPendingApprovalGroup = z.infer<typeof projectPendingApprovalGroupSchema>;

export const projectPendingApprovalsResponseSchema = z.object({
  groups: z.array(projectPendingApprovalGroupSchema),
});
export type ProjectPendingApprovalsResponse = z.infer<typeof projectPendingApprovalsResponseSchema>;
