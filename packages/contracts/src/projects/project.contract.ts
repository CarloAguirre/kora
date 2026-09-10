import { z } from 'zod';
import {
  arrayQueryParam,
  isoDateTimeSchema,
  nonEmptyTrimmed,
  pageSchema,
  paginationQuerySchema,
  sortDirectionSchema,
  uuidSchema,
} from '../common/primitives';
import { clientContactSchema } from '../clients/client.contract';

/** Ver docs/DECISION-M3-ESTADOS.md: por qué son cuatro campos independientes. */

export const PROJECT_TYPES = ['development', 'support'] as const;
export const projectTypeSchema = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof projectTypeSchema>;

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectType, string>> = {
  development: 'Desarrollo',
  support: 'Soporte',
};

export const PROJECT_SALES_STAGES = ['prospect', 'quoted', 'approved'] as const;
export const projectSalesStageSchema = z.enum(PROJECT_SALES_STAGES);
export type ProjectSalesStage = z.infer<typeof projectSalesStageSchema>;

export const PROJECT_SALES_STAGE_LABELS: Readonly<Record<ProjectSalesStage, string>> = {
  prospect: 'Prospecto',
  quoted: 'Cotización',
  approved: 'Aprobado',
};

export const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'finished', 'cancelled'] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  draft: 'No iniciado',
  active: 'Activo',
  on_hold: 'Detenido',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

export const PROJECT_PHASES = ['discovery', 'development', 'testing', 'pilot', 'closed'] as const;
export const projectPhaseSchema = z.enum(PROJECT_PHASES);
export type ProjectPhase = z.infer<typeof projectPhaseSchema>;

export const PROJECT_PHASE_LABELS: Readonly<Record<ProjectPhase, string>> = {
  discovery: 'Levantamiento',
  development: 'En desarrollo',
  testing: 'Pruebas',
  pilot: 'Marcha blanca',
  closed: 'Cerrado',
};

export const PROJECT_PRIORITIES = ['low', 'medium', 'high'] as const;
export const projectPrioritySchema = z.enum(PROJECT_PRIORITIES);
export type ProjectPriority = z.infer<typeof projectPrioritySchema>;

export const PROJECT_PRIORITY_LABELS: Readonly<Record<ProjectPriority, string>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export const projectTeamMemberSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  teamMemberId: uuidSchema,
  userId: uuidSchema,
  fullName: z.string(),
  activity: z.string().nullable(),
  assignedHours: z.number(),
  consumedHours: z.number(),
});
export type ProjectTeamMember = z.infer<typeof projectTeamMemberSchema>;

/**
 * Equipo asignado al proyecto (v1: `equipo_proyecto`) — distinto de
 * `projectTeamMemberSchema`: este es el nivel equipo (líder, HH
 * presupuestadas), no la persona individual. `memberCount` se recalcula en
 * vivo contando `project_team_members`, no se usa el valor migrado (la v1 no
 * lo tenía, así que siempre llegaba nulo).
 */
export const projectTeamSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  leader: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  assignedHours: z.number().nullable(),
  memberCount: z.number().int(),
});
export type ProjectTeam = z.infer<typeof projectTeamSchema>;

export const projectObservationSchema = z.object({
  id: uuidSchema,
  message: z.string(),
  authorUserId: uuidSchema,
  authorName: z.string(),
  createdAt: isoDateTimeSchema,
  /** true solo para el autor, y solo dentro de la ventana de edición — ver `PROJECT_OBSERVATION_EDIT_WINDOW_MS`. */
  canEdit: z.boolean(),
});
export type ProjectObservation = z.infer<typeof projectObservationSchema>;

export const projectSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  client: z.object({ id: uuidSchema, companyName: z.string() }).nullable(),
  type: projectTypeSchema,
  salesStage: projectSalesStageSchema.nullable(),
  status: projectStatusSchema,
  phase: projectPhaseSchema.nullable(),
  priority: projectPrioritySchema.nullable(),
  leader: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  soldHours: z.number(),
  usedHours: z.number(),
  /** Colaboradores con una fila en `project_team_members` (personas asignadas a trabajar en el proyecto). */
  assignedMemberCount: z.number().int(),
  /** Suma de `assignedHours` de todos los miembros asignados — "HH Planificación" del proyecto. */
  plannedHours: z.number(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  actualProgress: z.number().int().nullable(),
  supportPlanDescription: z.string().nullable(),
  supportHours: z.number(),
  /** Habilitado por el líder del proyecto/equipo — sin esto, las horas cargadas contra este proyecto no pueden marcarse como horas extra. */
  allowsOvertime: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectDetailSchema = projectSummarySchema.extend({
  developer: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  commercialManager: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  /** Contacto principal DE ESTE PROYECTO (v1: `proyecto.id_contacto`) — puede diferir del contacto general del cliente. */
  primaryContact: clientContactSchema.nullable(),
  estimatedDeliveryDate: z.string().nullable(),
  expectedProgress: z.number().int().nullable(),
  overtimeRateUf: z.number(),
  /** Igual criterio que el resto de los flags "puede gestionar" — no basta con `projects:manage`, ver `GetProjectUseCase`. */
  canAuthorizeOvertime: z.boolean(),
  quotationLink: z.string().nullable(),
  contractLink: z.string().nullable(),
  additionalLinks: z.string().nullable(),
  teams: z.array(projectTeamSchema),
  members: z.array(projectTeamMemberSchema),
  observations: z.array(projectObservationSchema),
  legacyId: z.number().int().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** Equipo asignado desde la creación del proyecto — ver `project_teams` (v1: `equipo_proyecto`). */
export const createProjectTeamAssignmentSchema = z.object({
  teamId: uuidSchema,
  leaderUserId: uuidSchema.nullish(),
  memberCount: z.coerce.number().int().min(0).nullish(),
  assignedHours: z.coerce.number().min(0).nullish(),
});
export type CreateProjectTeamAssignmentInput = z.infer<typeof createProjectTeamAssignmentSchema>;

export const createProjectSchema = z
  .object({
    name: nonEmptyTrimmed(300, 'El nombre del proyecto'),
    clientId: uuidSchema.nullish(),
    type: projectTypeSchema,
    salesStage: projectSalesStageSchema.nullish(),
    /** Subconjunto de `PROJECT_STATUSES` con sentido al crear — igual que "Estado" en la v1 (Activo/No iniciado/Detenido). */
    status: z.enum(['draft', 'active', 'on_hold']).nullish(),
    phase: projectPhaseSchema.nullish(),
    priority: projectPrioritySchema.nullish(),
    leaderUserId: uuidSchema.nullish(),
    developerUserId: uuidSchema.nullish(),
    commercialManagerUserId: uuidSchema.nullish(),
    startDate: z.iso.date().nullish(),
    estimatedDeliveryDate: z.iso.date().nullish(),
    soldHours: z.coerce.number().min(0).default(0),
    supportPlanDescription: z.string().trim().max(2000).optional(),
    supportHours: z.coerce.number().min(0).default(0),
    quotationLink: z.string().trim().max(500).optional(),
    contractLink: z.string().trim().max(500).optional(),
    additionalLinks: z.string().trim().max(500).optional(),
    teams: z.array(createProjectTeamAssignmentSchema).max(20).default([]),
  })
  .refine((data) => data.type !== 'development' || data.salesStage, {
    message: 'Los proyectos de desarrollo requieren una etapa comercial.',
    path: ['salesStage'],
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre del proyecto').optional(),
  clientId: uuidSchema.nullish(),
  salesStage: projectSalesStageSchema.nullish(),
  phase: projectPhaseSchema.nullish(),
  priority: projectPrioritySchema.nullish(),
  leaderUserId: uuidSchema.nullish(),
  developerUserId: uuidSchema.nullish(),
  commercialManagerUserId: uuidSchema.nullish(),
  startDate: z.iso.date().nullish(),
  endDate: z.iso.date().nullish(),
  estimatedDeliveryDate: z.iso.date().nullish(),
  soldHours: z.coerce.number().min(0).optional(),
  expectedProgress: z.coerce.number().int().min(0).max(100).nullish(),
  actualProgress: z.coerce.number().int().min(0).max(100).nullish(),
  supportPlanDescription: z.string().trim().max(2000).optional(),
  supportHours: z.coerce.number().min(0).optional(),
  quotationLink: z.string().trim().max(500).optional(),
  contractLink: z.string().trim().max(500).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const changeProjectStatusSchema = z.object({ status: projectStatusSchema });
export type ChangeProjectStatusInput = z.infer<typeof changeProjectStatusSchema>;

export const setProjectOvertimeAuthorizationSchema = z.object({ allowsOvertime: z.boolean() });
export type SetProjectOvertimeAuthorizationInput = z.infer<typeof setProjectOvertimeAuthorizationSchema>;

export const assignProjectTeamMemberSchema = z.object({
  teamMemberId: uuidSchema,
  activity: z.string().trim().max(500).optional(),
  assignedHours: z.coerce.number().min(0).default(0),
});
export type AssignProjectTeamMemberInput = z.infer<typeof assignProjectTeamMemberSchema>;

export const addProjectObservationSchema = z.object({
  message: nonEmptyTrimmed(4000, 'El mensaje'),
});
export type AddProjectObservationInput = z.infer<typeof addProjectObservationSchema>;

export const updateProjectObservationSchema = z.object({
  message: nonEmptyTrimmed(4000, 'El mensaje'),
});
export type UpdateProjectObservationInput = z.infer<typeof updateProjectObservationSchema>;

export const projectSortFieldSchema = z.enum([
  'name',
  'status',
  'priority',
  'createdAt',
  'client',
  'leader',
  'startDate',
  'endDate',
  'progress',
  'soldHours',
  'usedHours',
  'remainingHours',
  'supportHours',
  'supportPlan',
  'deviationHours',
]);
export type ProjectSortField = z.infer<typeof projectSortFieldSchema>;

export const listProjectsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  type: projectTypeSchema.optional(),
  status: arrayQueryParam(projectStatusSchema),
  phase: arrayQueryParam(projectPhaseSchema),
  clientId: uuidSchema.optional(),
  leaderUserId: arrayQueryParam(uuidSchema),
  /** Filtra a los proyectos donde el usuario indicado participa (líder, desarrollador o miembro). */
  assignedToUserId: uuidSchema.optional(),
  /** Filtra a los proyectos con al menos un miembro de este equipo asignado. */
  teamId: uuidSchema.optional(),
  sortField: projectSortFieldSchema.default('priority'),
  sortDirection: sortDirectionSchema.default('desc'),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const listProjectsResponseSchema = pageSchema(projectSummarySchema);
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
