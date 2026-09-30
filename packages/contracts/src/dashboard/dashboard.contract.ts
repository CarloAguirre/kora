import { z } from 'zod';
import {
  projectModuleDeliveryStatusSchema,
  projectModuleTaskStatusSchema,
  projectPrioritySchema,
} from '../projects/project.contract';
import { forecastAssignmentTypeSchema } from '../forecast/forecast.contract';
import { ticketStatusSchema } from '../tickets/ticket.contract';
import { isoDateTimeSchema } from '../common/primitives';

/**
 * Ver docs/DECISION-M7-DASHBOARD.md.
 *
 * Un solo payload agregado: cada sección es `null` cuando el actor no tiene
 * el permiso correspondiente — decidido en el caso de uso, no ocultado solo
 * en la interfaz.
 */

export const dashboardHoursSummarySchema = z.object({
  todayHours: z.number(),
  weekHours: z.number(),
  weekTargetHours: z.number(),
  rejectedCount: z.number().int(),
});
export type DashboardHoursSummary = z.infer<typeof dashboardHoursSummarySchema>;

/** Desglose de aprobaciones pendientes por equipo del autor (`teamId`/`teamName` `null` si no tiene equipo activo). */
export const dashboardApprovalsTeamSchema = z.object({
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  pendingCount: z.number().int(),
});
export type DashboardApprovalsTeam = z.infer<typeof dashboardApprovalsTeamSchema>;

export const dashboardApprovalsSummarySchema = z.object({
  pendingCount: z.number().int(),
  /** Ordenado de mayor a menor `pendingCount`. */
  pendingByTeam: z.array(dashboardApprovalsTeamSchema),
});
export type DashboardApprovalsSummary = z.infer<typeof dashboardApprovalsSummarySchema>;

export const dashboardScopeSchema = z.enum(['own', 'all']);
export type DashboardScope = z.infer<typeof dashboardScopeSchema>;

export const dashboardTicketStatusCountSchema = z.object({
  status: ticketStatusSchema,
  count: z.number().int(),
});
export type DashboardTicketStatusCount = z.infer<typeof dashboardTicketStatusCountSchema>;

export const dashboardOldestOpenTicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: ticketStatusSchema,
  createdAt: isoDateTimeSchema,
  clientName: z.string().nullable(),
  assigneeName: z.string().nullable(),
});
export type DashboardOldestOpenTicket = z.infer<typeof dashboardOldestOpenTicketSchema>;

export const dashboardTicketsSummarySchema = z.object({
  openCount: z.number().int(),
  /** Solo estados abiertos con al menos un ticket, en el orden del flujo (pending → in_progress → in_testing → done). */
  byStatus: z.array(dashboardTicketStatusCountSchema),
  /** El ticket abierto más antiguo por fecha de creación — `null` si no hay tickets abiertos. */
  oldestOpenTicket: dashboardOldestOpenTicketSchema.nullable(),
  /** `'own'` para todo actor que no sea admin/PMO (incluido el líder, aunque tenga `tickets:read`) — el conteo es de sus propios tickets, no de toda la organización. */
  scope: dashboardScopeSchema,
});
export type DashboardTicketsSummary = z.infer<typeof dashboardTicketsSummarySchema>;

export const dashboardCriticalProjectStatusSchema = z.enum(['critical', 'alert']);
export type DashboardCriticalProjectStatus = z.infer<typeof dashboardCriticalProjectStatusSchema>;

export const dashboardCriticalProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  leaderFullName: z.string().nullable(),
  priority: projectPrioritySchema.nullable(),
  usedHours: z.number(),
  soldHours: z.number(),
  planningHours: z.number(),
  actualProgress: z.number().int(),
  expectedProgress: z.number().int(),
  status: dashboardCriticalProjectStatusSchema,
  stageLabel: z.string(),
});
export type DashboardCriticalProject = z.infer<typeof dashboardCriticalProjectSchema>;

/** Salud de TODOS los proyectos activos (no solo los 4 de `criticalProjects`) — mismo criterio de `dashboardCriticalProjectStatusSchema` más el resto ('optimal'). */
export const dashboardProjectsHealthBreakdownSchema = z.object({
  critical: z.number().int(),
  alert: z.number().int(),
  optimal: z.number().int(),
});
export type DashboardProjectsHealthBreakdown = z.infer<typeof dashboardProjectsHealthBreakdownSchema>;

export const dashboardProjectsSummarySchema = z.object({
  activeCount: z.number().int(),
  deviationAlertsCount: z.number().int(),
  deviationHoursTotal: z.number(),
  prospectCount: z.number().int(),
  quotationCount: z.number().int(),
  finishedCount: z.number().int(),
  closingThisMonthCount: z.number().int(),
  healthBreakdown: dashboardProjectsHealthBreakdownSchema,
  criticalProjects: z.array(dashboardCriticalProjectSchema),
  /** `'own'` para todo actor que no sea admin/PMO — todos los conteos están acotados a los proyectos donde participa. */
  scope: dashboardScopeSchema,
});
export type DashboardProjectsSummary = z.infer<typeof dashboardProjectsSummarySchema>;

export const dashboardCapacityTeamSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  capacityHours: z.number(),
  assignedHours: z.number(),
  freeHours: z.number(),
});
export type DashboardCapacityTeam = z.infer<typeof dashboardCapacityTeamSchema>;

export const dashboardCapacitySummarySchema = z.object({
  averageLoadPercent: z.number(),
  memberCount: z.number().int(),
  scopeLabel: z.string(),
  weekStart: z.string(),
  byTeam: z.array(dashboardCapacityTeamSchema),
});
export type DashboardCapacitySummary = z.infer<typeof dashboardCapacitySummarySchema>;

export const dashboardSupportClientSchema = z.object({
  name: z.string(),
  usedHours: z.number(),
  soldHours: z.number(),
  percent: z.number().int(),
});
export type DashboardSupportClient = z.infer<typeof dashboardSupportClientSchema>;

export const dashboardSupportTrendPointSchema = z.object({
  month: z.string(),
  usedHours: z.number(),
  contractedHours: z.number(),
});
export type DashboardSupportTrendPoint = z.infer<typeof dashboardSupportTrendPointSchema>;

export const dashboardSupportSummarySchema = z.object({
  projectsWithSupportCount: z.number().int(),
  soldHours: z.number(),
  usedHours: z.number(),
  deviationHours: z.number(),
  usedPercent: z.number().int(),
  deviationPercent: z.number().int(),
  topClients: z.array(dashboardSupportClientSchema),
  /** Últimos 12 meses (más antiguo primero), horas reales prorrateadas por el rango de fechas de cada proyecto — no sintético. */
  trend: z.array(dashboardSupportTrendPointSchema),
  /** `'own'` cuando el actor es líder (no admin/pmo) — acotado a los proyectos de soporte que lidera. */
  scope: dashboardScopeSchema,
});
export type DashboardSupportSummary = z.infer<typeof dashboardSupportSummarySchema>;

export const dashboardPlanningItemSchema = z.object({
  type: forecastAssignmentTypeSchema,
  projectName: z.string().nullable(),
  hours: z.number(),
});
export type DashboardPlanningItem = z.infer<typeof dashboardPlanningItemSchema>;

export const dashboardTeamMemberPlanningSchema = z.object({
  fullName: z.string(),
  items: z.array(dashboardPlanningItemSchema),
  totalHours: z.number(),
});
export type DashboardTeamMemberPlanning = z.infer<typeof dashboardTeamMemberPlanningSchema>;

/**
 * "Mi Planificación" — reemplaza "Planificación Semanal" + "Mi Equipo" de la
 * v1 (`ColaboradorDashboard`). Se computa igual para cualquier actor que sea
 * miembro de un equipo (no solo `collaborator`), sin exigir un permiso de
 * forecast propio: es la misma fila que ya ve su líder en `/forecast`, acotada
 * a la del actor — ver `ForecastCapacityService.getCapacitySummaryWithUserIds`.
 */
export const dashboardMyPlanningSchema = z.object({
  weekStart: z.string(),
  items: z.array(dashboardPlanningItemSchema),
  totalHours: z.number(),
  teamName: z.string().nullable(),
  /** Resto del equipo del actor (sin incluirlo) — `null` si no pertenece a ningún equipo. */
  teamMembers: z.array(dashboardTeamMemberPlanningSchema).nullable(),
});
export type DashboardMyPlanning = z.infer<typeof dashboardMyPlanningSchema>;

export const dashboardMyActiveProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type DashboardMyActiveProject = z.infer<typeof dashboardMyActiveProjectSchema>;

/** "Mis tareas" — tareas de "Fases · Módulos" asignadas directamente al actor. */
export const dashboardMyTaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  moduleId: z.string(),
  moduleName: z.string(),
  title: z.string(),
  date: z.string(),
  status: projectModuleTaskStatusSchema,
  completedAt: isoDateTimeSchema.nullable(),
  rejectionReason: z.string().nullable(),
});
export type DashboardMyTask = z.infer<typeof dashboardMyTaskSchema>;

/** "Mis entregas" — entregas de "Fases · Módulos" asignadas directamente al actor. */
export const dashboardMyDeliverySchema = z.object({
  id: z.string(),
  /** Nulo en entregas creadas antes de que existiera el nombre. */
  name: z.string().nullable(),
  projectId: z.string(),
  projectName: z.string(),
  moduleId: z.string(),
  moduleName: z.string(),
  estimatedDate: z.string(),
  status: projectModuleDeliveryStatusSchema,
  rejectionReason: z.string().nullable(),
});
export type DashboardMyDelivery = z.infer<typeof dashboardMyDeliverySchema>;

export const dashboardSummarySchema = z.object({
  hours: dashboardHoursSummarySchema.nullable(),
  approvals: dashboardApprovalsSummarySchema.nullable(),
  tickets: dashboardTicketsSummarySchema.nullable(),
  projects: dashboardProjectsSummarySchema.nullable(),
  capacity: dashboardCapacitySummarySchema.nullable(),
  support: dashboardSupportSummarySchema.nullable(),
  planning: dashboardMyPlanningSchema.nullable(),
  /**
   * Proyectos activos donde el actor participa — a diferencia de `projects`
   * (que exige `projects:read`/`projects:read_assigned`), esta lista es
   * personal e incondicional, igual que `hours`: es la misma info que ya
   * podría ver en la ficha de cualquier proyecto donde participa, solo que
   * resumida para el panel "Proyectos de la Semana".
   */
  myActiveProjects: z.array(dashboardMyActiveProjectSchema),
  /** Tareas asignadas directamente al actor, en cualquier proyecto — incondicional, igual criterio que `myActiveProjects`. */
  myTasks: z.array(dashboardMyTaskSchema),
  /** Entregas del equipo del actor — vacío si no pertenece a ningún equipo. */
  myDeliveries: z.array(dashboardMyDeliverySchema),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
