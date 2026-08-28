import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from '../common/primitives';

/** Ver docs/DECISION-M6-FORECAST.md. */

export const FORECAST_ASSIGNMENT_TYPES = [
  'project',
  'support',
  'vacation',
  'admin_day',
  'day_off',
  'sick_leave',
  'training',
  'other',
] as const;
export const forecastAssignmentTypeSchema = z.enum(FORECAST_ASSIGNMENT_TYPES);
export type ForecastAssignmentType = z.infer<typeof forecastAssignmentTypeSchema>;

export const FORECAST_ASSIGNMENT_TYPE_LABELS: Readonly<Record<ForecastAssignmentType, string>> = {
  project: 'Proyecto',
  support: 'Soporte',
  vacation: 'Vacaciones',
  admin_day: 'Día administrativo',
  day_off: 'Día libre',
  sick_leave: 'Licencia médica',
  training: 'Capacitación',
  other: 'Otros',
};

/** Solo estos dos tipos muestran selector de cliente y proyecto — `usesClientProjectSelectors` en la v1. */
export const FORECAST_TYPES_WITH_PROJECT: readonly ForecastAssignmentType[] = ['project', 'support'];

function isMonday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 1;
}

function isFullWorkWeek(periodStart: string, periodEnd: string): boolean {
  const start = new Date(`${periodStart}T00:00:00Z`).getTime();
  const end = new Date(`${periodEnd}T00:00:00Z`).getTime();
  return end - start === 4 * 24 * 60 * 60 * 1000;
}

export const forecastAssignmentSchema = z.object({
  id: uuidSchema,
  teamMemberId: uuidSchema,
  memberFullName: z.string(),
  teamId: uuidSchema,
  teamName: z.string(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  type: forecastAssignmentTypeSchema,
  project: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  client: z.object({ id: uuidSchema, companyName: z.string() }).nullable(),
  comments: z.string(),
  assignedHours: z.number(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ForecastAssignment = z.infer<typeof forecastAssignmentSchema>;

export const createForecastAssignmentSchema = z
  .object({
    teamMemberId: uuidSchema,
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    type: forecastAssignmentTypeSchema,
    projectId: uuidSchema.nullish(),
    clientId: uuidSchema.nullish(),
    comments: z.string().trim().max(500).optional(),
    assignedHours: z.coerce.number().min(0).max(999),
  })
  .refine((v) => isMonday(v.periodStart), {
    message: 'El período debe iniciar un lunes.',
    path: ['periodStart'],
  })
  .refine((v) => isFullWorkWeek(v.periodStart, v.periodEnd), {
    message: 'El período debe ser una semana completa (lunes a viernes).',
    path: ['periodEnd'],
  });
export type CreateForecastAssignmentInput = z.infer<typeof createForecastAssignmentSchema>;

export const updateForecastAssignmentSchema = z.object({
  type: forecastAssignmentTypeSchema.optional(),
  projectId: uuidSchema.nullish(),
  clientId: uuidSchema.nullish(),
  comments: z.string().trim().max(500).optional(),
  assignedHours: z.coerce.number().min(0).max(999).optional(),
});
export type UpdateForecastAssignmentInput = z.infer<typeof updateForecastAssignmentSchema>;

export const listForecastAssignmentsQuerySchema = z.object({
  teamId: uuidSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
});
export type ListForecastAssignmentsQuery = z.infer<typeof listForecastAssignmentsQuerySchema>;

export const listForecastAssignmentsResponseSchema = z.array(forecastAssignmentSchema);
export type ListForecastAssignmentsResponse = z.infer<typeof listForecastAssignmentsResponseSchema>;

/** Vista de solo lectura — reemplaza el RPC `get_forecast_capacity_view` de la v1. */
export const forecastCapacityQuerySchema = z.object({
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
});
export type ForecastCapacityQuery = z.infer<typeof forecastCapacityQuerySchema>;

export const forecastCapacityItemSchema = z.object({
  type: forecastAssignmentTypeSchema,
  projectId: uuidSchema.nullable(),
  projectName: z.string().nullable(),
  hours: z.number(),
  comments: z.array(z.string()),
});
export type ForecastCapacityItem = z.infer<typeof forecastCapacityItemSchema>;

export const forecastCapacityMemberSchema = z.object({
  teamMemberId: uuidSchema,
  fullName: z.string(),
  teamId: uuidSchema,
  teamName: z.string(),
  capacityHours: z.number(),
  assignedHours: z.number(),
  loadPercent: z.number(),
  items: z.array(forecastCapacityItemSchema),
});
export type ForecastCapacityMember = z.infer<typeof forecastCapacityMemberSchema>;

export const forecastCapacityResponseSchema = z.object({
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  members: z.array(forecastCapacityMemberSchema),
});
export type ForecastCapacityResponse = z.infer<typeof forecastCapacityResponseSchema>;

/** Historial — proyección de `audit_log` filtrada por equipo y período, ver docs/DECISION-M6-FORECAST.md. */
export const forecastHistoryActionSchema = z.enum(['created', 'updated', 'deleted']);
export type ForecastHistoryAction = z.infer<typeof forecastHistoryActionSchema>;

export const forecastHistoryEntrySchema = z.object({
  id: uuidSchema,
  action: forecastHistoryActionSchema,
  memberFullName: z.string().nullable(),
  teamName: z.string().nullable(),
  periodStart: z.iso.date().nullable(),
  periodEnd: z.iso.date().nullable(),
  type: forecastAssignmentTypeSchema.nullable(),
  projectName: z.string().nullable(),
  clientName: z.string().nullable(),
  assignedHours: z.number().nullable(),
  comments: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: isoDateTimeSchema,
});
export type ForecastHistoryEntry = z.infer<typeof forecastHistoryEntrySchema>;

export const listForecastHistoryQuerySchema = z.object({
  teamId: uuidSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
});
export type ListForecastHistoryQuery = z.infer<typeof listForecastHistoryQuerySchema>;

export const listForecastHistoryResponseSchema = z.array(forecastHistoryEntrySchema);
export type ListForecastHistoryResponse = z.infer<typeof listForecastHistoryResponseSchema>;
