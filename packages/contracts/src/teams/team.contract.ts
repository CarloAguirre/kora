import { z } from 'zod';
import {
  isoDateTimeSchema,
  nonEmptyTrimmed,
  pageSchema,
  paginationQuerySchema,
  sortDirectionSchema,
  uuidSchema,
} from '../common/primitives';
import { userStatusSchema } from '../users/user.contract';
import { projectStatusSchema } from '../projects/project.contract';

/**
 * Contrato de equipos.
 *
 * `weeklyHours` es la base del cálculo de disponibilidad que usará el
 * forecast (M6): cuánta capacidad semanal tiene comprometida cada persona.
 */

export const teamMemberSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  fullName: z.string(),
  /** Un deshabilitado sigue en el equipo hasta que lo saquen, pero no se ofrece para asignar trabajo. */
  userStatus: userStatusSchema,
  position: z.string().nullable(),
  weeklyHours: z.number(),
  joinedAt: isoDateTimeSchema,
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

/** Categoría visual del equipo. Catálogo abierto: cualquiera con `teams:manage` puede crear tipos nuevos. */
export const teamTypeSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  color: z.string(),
  icon: z.string(),
});
export type TeamType = z.infer<typeof teamTypeSchema>;

export const createTeamTypeSchema = z.object({
  name: nonEmptyTrimmed(60, 'El nombre del tipo de equipo'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe ser un hexadecimal, p. ej. #2563EB'),
  icon: z.string().trim().min(1).max(40),
});
export type CreateTeamTypeInput = z.infer<typeof createTeamTypeSchema>;

/** Editar un tipo reemplaza sus tres campos: el formulario siempre los envía completos. */
export const updateTeamTypeSchema = createTeamTypeSchema;
export type UpdateTeamTypeInput = z.infer<typeof updateTeamTypeSchema>;

export const listTeamTypesResponseSchema = z.object({ items: z.array(teamTypeSchema) });
export type ListTeamTypesResponse = z.infer<typeof listTeamTypesResponseSchema>;

export const teamSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  leader: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  teamType: teamTypeSchema.nullable(),
  memberCount: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const teamDetailSchema = teamSummarySchema.extend({
  members: z.array(teamMemberSchema),
  legacyId: z.number().int().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type TeamDetail = z.infer<typeof teamDetailSchema>;

export const createTeamSchema = z.object({
  name: nonEmptyTrimmed(120, 'El nombre del equipo'),
  description: z.string().trim().max(500).optional(),
  leaderUserId: uuidSchema.nullish(),
  teamTypeId: uuidSchema.nullish(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({
  userId: uuidSchema,
  position: z.string().trim().max(120).optional(),
  weeklyHours: z.coerce.number().min(0).max(80).default(44),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  position: z.string().trim().max(120).optional(),
  weeklyHours: z.coerce.number().min(0).max(80).optional(),
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

/**
 * Miembro activo de CUALQUIER equipo, con el nombre de su equipo — usado por
 * el buscador de personas al asignar a un proyecto (que no está acotado a un
 * equipo en particular, a diferencia de `teamDetailSchema.members`).
 */
export const teamMemberOptionSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  teamId: uuidSchema,
  teamName: z.string(),
});
export type TeamMemberOption = z.infer<typeof teamMemberOptionSchema>;

export const listTeamMemberOptionsResponseSchema = z.object({
  items: z.array(teamMemberOptionSchema),
});
export type ListTeamMemberOptionsResponse = z.infer<typeof listTeamMemberOptionsResponseSchema>;

export const teamSortFieldSchema = z.enum(['name', 'memberCount', 'createdAt']);
export type TeamSortField = z.infer<typeof teamSortFieldSchema>;

export const listTeamsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  isActive: z.stringbool().optional(),
  /** Equipos liderados por este usuario — usado por el selector de equipo del forecast (M6). */
  leaderUserId: uuidSchema.optional(),
  sortField: teamSortFieldSchema.default('name'),
  sortDirection: sortDirectionSchema.default('asc'),
});
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;

export const listTeamsResponseSchema = pageSchema(teamSummarySchema);
export type ListTeamsResponse = z.infer<typeof listTeamsResponseSchema>;

/**
 * Disponibilidad real del equipo: horas aprobadas por colaborador y día en un
 * rango — equivalente al heatmap "Disponibilidad" de `LiderEquipos` (v1).
 * A diferencia del forecast (M6), que es capacidad planificada a futuro, esto
 * refleja horas ya trabajadas y aprobadas.
 */
export const teamAvailabilityQuerySchema = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
});
export type TeamAvailabilityQuery = z.infer<typeof teamAvailabilityQuerySchema>;

export const teamAvailabilityDaySchema = z.object({
  date: z.string(),
  /** HH aprobadas. */
  hours: z.number(),
  /** HH enviadas que todavía esperan aprobación. */
  pendingHours: z.number(),
});
export type TeamAvailabilityDay = z.infer<typeof teamAvailabilityDaySchema>;

export const teamAvailabilityMemberSchema = z.object({
  teamMemberId: uuidSchema,
  /** Para cruzar con la cola de aprobación (`HourEntrySummary.user.id`). */
  userId: uuidSchema,
  fullName: z.string(),
  weeklyHours: z.number(),
  days: z.array(teamAvailabilityDaySchema),
});
export type TeamAvailabilityMember = z.infer<typeof teamAvailabilityMemberSchema>;

export const teamAvailabilityResponseSchema = z.object({
  teamId: uuidSchema,
  members: z.array(teamAvailabilityMemberSchema),
});
export type TeamAvailabilityResponse = z.infer<typeof teamAvailabilityResponseSchema>;

/**
 * "Reporte de equipo" del líder (`/equipos`) — una fila por proyecto con el que el equipo
 * tiene relación (`project_teams`), con las HH de cada persona del equipo en el período y
 * el acumulado hasta el fin del período. Las HH pendientes viajan aparte para que el
 * cliente pueda sumarlas o no ("Incluir HH pendientes") sin volver a pedir el reporte.
 */
export const teamReportQuerySchema = z
  .object({
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'La fecha "desde" no puede ser posterior a "hasta".',
    path: ['dateTo'],
  });
export type TeamReportQuery = z.infer<typeof teamReportQuerySchema>;

const teamReportPersonSchema = z.object({ id: uuidSchema, fullName: z.string() });

export const teamReportMemberHoursSchema = z.object({
  userId: uuidSchema,
  /** HH dentro de [dateFrom, dateTo]. */
  periodApproved: z.number(),
  periodPending: z.number(),
  /** HH desde el inicio del proyecto hasta `dateTo` — base de "Incurridas vs. Asignadas". */
  accumulatedApproved: z.number(),
  accumulatedPending: z.number(),
});
export type TeamReportMemberHours = z.infer<typeof teamReportMemberHoursSchema>;

export const teamReportProjectSchema = z.object({
  projectId: uuidSchema,
  name: z.string(),
  slug: z.string(),
  client: z.object({ id: uuidSchema, companyName: z.string() }).nullable(),
  status: projectStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  /** `project_teams.assigned_hours` — HH asignadas al equipo. Las carga el Líder PM del proyecto. */
  assignedHours: z.number().nullable(),
  /** Responsable del equipo en este proyecto (`project_teams.leader_user_id`). */
  responsible: teamReportPersonSchema.nullable(),
  /** Líder PM del proyecto — quien carga fechas y HH asignadas. */
  projectLeader: teamReportPersonSchema.nullable(),
  hours: z.array(teamReportMemberHoursSchema),
  /** Tareas de las fases del proyecto asignadas a este equipo, y cuántas ya están aprobadas (`done`). */
  teamTasks: z.object({ total: z.number().int(), approved: z.number().int() }),
  /** Alguna entrega a cliente de este equipo quedó aprobada. */
  teamDeliveryApproved: z.boolean(),
  comment: z.string().nullable(),
  /** Cuándo se le pidió al Líder PM completar fechas/HH asignadas desde el reporte. `null` si nunca. */
  dataRequestedAt: isoDateTimeSchema.nullable(),
});
export type TeamReportProject = z.infer<typeof teamReportProjectSchema>;

export const teamReportResponseSchema = z.object({
  teamId: uuidSchema,
  teamName: z.string(),
  dateFrom: z.string(),
  dateTo: z.string(),
  /** Columnas de "HH Incurridas": miembros activos del equipo (y su líder, si no figura como miembro). */
  members: z.array(teamReportPersonSchema),
  projects: z.array(teamReportProjectSchema),
});
export type TeamReportResponse = z.infer<typeof teamReportResponseSchema>;

export const updateTeamReportCommentSchema = z.object({
  comment: z.string().trim().max(2000),
});
export type UpdateTeamReportCommentInput = z.infer<typeof updateTeamReportCommentSchema>;

/** "Pedir datos a los Líderes PM": proyectos del reporte cuyo Líder PM debe completar fechas o HH asignadas. */
export const requestTeamReportDataSchema = z.object({
  projectIds: z.array(uuidSchema).min(1).max(500),
  note: z.string().trim().max(1000).optional(),
});
export type RequestTeamReportDataInput = z.infer<typeof requestTeamReportDataSchema>;

export const requestTeamReportDataResponseSchema = z.object({
  /** Líderes PM notificados (una notificación cada uno). */
  notifiedLeaders: z.number().int(),
  requestedProjects: z.number().int(),
});
export type RequestTeamReportDataResponse = z.infer<typeof requestTeamReportDataResponseSchema>;
