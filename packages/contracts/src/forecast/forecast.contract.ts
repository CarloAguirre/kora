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

/**
 * De dónde sale una fila: `manual` la cargó el líder; `segment` y `task` las calcula Kora desde un
 * tramo del Roadmap o una tarea del proyecto. Ver docs/DECISION-M6-FORECAST.md, "Forecast calculado".
 */
export const FORECAST_ASSIGNMENT_SOURCES = ['manual', 'segment', 'task'] as const;
export const forecastAssignmentSourceSchema = z.enum(FORECAST_ASSIGNMENT_SOURCES);
export type ForecastAssignmentSource = z.infer<typeof forecastAssignmentSourceSchema>;

/**
 * Estado de las HH de una fila, tal como lo ve el líder: `calculated` sigue al proyecto, `adjusted`
 * lo fijó el líder sobre una fila calculada, `manual` la cargó a mano.
 */
export const FORECAST_HOURS_ORIGINS = ['calculated', 'adjusted', 'manual'] as const;
export const forecastHoursOriginSchema = z.enum(FORECAST_HOURS_ORIGINS);
export type ForecastHoursOrigin = z.infer<typeof forecastHoursOriginSchema>;

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
  source: forecastAssignmentSourceSchema,
  /** Tramo de ejecución del Roadmap que generó esta fila (`source = 'segment'`). */
  segment: z.object({ id: uuidSchema, name: z.string(), moduleName: z.string() }).nullable(),
  /** Tarea que generó esta fila (`source = 'task'`). */
  task: z.object({ id: uuidSchema, name: z.string(), moduleName: z.string() }).nullable(),
  /** Lo que dice el cálculo — `null` en las filas manuales. */
  calculatedHours: z.number().nullable(),
  /** El líder fijó las HH de una fila calculada; desde entonces el cálculo no las cambia. */
  adjusted: z.object({ at: isoDateTimeSchema, byName: z.string().nullable() }).nullable(),
  /** El cálculo cambió después del ajuste: el líder decide si mantiene su valor o usa el nuevo. */
  isStale: z.boolean(),
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

/**
 * En una fila calculada solo se pueden cambiar las HH (eso la deja ajustada) y los comentarios; tipo,
 * cliente y proyecto vienen del proyecto.
 */
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
  origin: forecastHoursOriginSchema,
  /** Alguna de las filas agrupadas quedó desfasada. */
  isStale: z.boolean(),
});
export type ForecastCapacityItem = z.infer<typeof forecastCapacityItemSchema>;

export const forecastDeliveryMarkSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  projectName: z.string(),
  moduleName: z.string(),
  date: z.iso.date(),
});
export type ForecastDeliveryMark = z.infer<typeof forecastDeliveryMarkSchema>;

export const forecastContainedTaskSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  projectName: z.string(),
  moduleName: z.string(),
  startDate: z.iso.date(),
  date: z.iso.date(),
  estimatedHours: z.number(),
});
export type ForecastContainedTask = z.infer<typeof forecastContainedTaskSchema>;

export const forecastUnscheduledHoursSchema = z.object({
  projectId: uuidSchema,
  projectName: z.string(),
  /** HH asignadas a la persona en el equipo del proyecto. */
  assignedHours: z.number(),
  /** HH de ese proyecto que ya tiene en el Forecast, sumando todas las semanas. */
  plannedHours: z.number(),
});
export type ForecastUnscheduledHours = z.infer<typeof forecastUnscheduledHoursSchema>;

export const forecastCapacityMemberSchema = z.object({
  teamMemberId: uuidSchema,
  fullName: z.string(),
  teamId: uuidSchema,
  teamName: z.string(),
  capacityHours: z.number(),
  assignedHours: z.number(),
  loadPercent: z.number(),
  items: z.array(forecastCapacityItemSchema),
  /** Entregas a cargo del colaborador con fecha estimada en el período — marca, no suma HH. */
  deliveries: z.array(forecastDeliveryMarkSchema),
  /** Tareas del colaborador en el período que no suman porque ya están cubiertas por su tramo. */
  containedTasks: z.array(forecastContainedTaskSchema),
  /** Proyectos donde tiene más HH asignadas que las que el Forecast llegó a calendarizar. */
  unscheduled: z.array(forecastUnscheduledHoursSchema),
  /** HH registradas (pendientes o aprobadas) en el período — para comparar plan contra real. */
  loggedHours: z.number(),
});
export type ForecastCapacityMember = z.infer<typeof forecastCapacityMemberSchema>;

export const forecastCapacityResponseSchema = z.object({
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  members: z.array(forecastCapacityMemberSchema),
});
export type ForecastCapacityResponse = z.infer<typeof forecastCapacityResponseSchema>;

/** Vista "Próximas semanas": carga de cada colaborador en varias semanas seguidas. */
export const forecastWeeksQuerySchema = z
  .object({
    from: z.iso.date(),
    weeks: z.coerce.number().int().min(1).max(12).default(6),
  })
  .refine((v) => isMonday(v.from), { message: 'La primera semana debe iniciar un lunes.', path: ['from'] });
export type ForecastWeeksQuery = z.infer<typeof forecastWeeksQuerySchema>;

export const forecastWeekCellSchema = z.object({
  periodStart: z.iso.date(),
  capacityHours: z.number(),
  assignedHours: z.number(),
  loadPercent: z.number(),
  /** HH de vacaciones, licencias, días libres o administrativos. */
  absenceHours: z.number(),
  hasAdjusted: z.boolean(),
  hasStale: z.boolean(),
  deliveryCount: z.number().int(),
});
export type ForecastWeekCell = z.infer<typeof forecastWeekCellSchema>;

export const forecastWeeksResponseSchema = z.object({
  weeks: z.array(z.object({ periodStart: z.iso.date(), periodEnd: z.iso.date(), businessDays: z.number().int() })),
  members: z.array(
    z.object({
      teamMemberId: uuidSchema,
      fullName: z.string(),
      teamId: uuidSchema,
      teamName: z.string(),
      cells: z.array(forecastWeekCellSchema),
    }),
  ),
});
export type ForecastWeeksResponse = z.infer<typeof forecastWeeksResponseSchema>;

/**
 * "¿Esto sobrecarga a alguien?" — antes de guardar un tramo o una tarea, calcula las HH que agregaría
 * a cada persona (mismo cálculo que el Forecast) y avisa las semanas en que ya estaba al 100 % o lo
 * pasaría. No bloquea: el líder decide.
 */
export const forecastLoadPreviewInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('segment'),
    /** Al editar un tramo: sus filas actuales no se cuentan como carga existente. */
    segmentId: uuidSchema.nullish(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    members: z.array(z.object({ teamMemberId: uuidSchema, dailyPercent: z.number().min(0).max(100).nullable() })),
  }),
  z.object({
    kind: z.literal('task'),
    /** Al editar una tarea: sus filas actuales no se cuentan como carga existente. */
    taskId: uuidSchema.nullish(),
    moduleId: uuidSchema,
    teamId: uuidSchema.nullish(),
    assigneeUserId: uuidSchema,
    startDate: z.iso.date(),
    date: z.iso.date(),
    estimatedHours: z.number().min(0),
  }),
]);
export type ForecastLoadPreviewInput = z.infer<typeof forecastLoadPreviewInputSchema>;

export const forecastOverloadWarningSchema = z.object({
  teamMemberId: uuidSchema,
  fullName: z.string(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  capacityHours: z.number(),
  /** HH que ya tenía esa semana, sin contar el tramo o la tarea que se está editando. */
  currentHours: z.number(),
  /** HH que agregaría lo que se está guardando. */
  addedHours: z.number(),
  totalHours: z.number(),
  loadPercent: z.number(),
});
export type ForecastOverloadWarning = z.infer<typeof forecastOverloadWarningSchema>;

export const forecastLoadPreviewResponseSchema = z.object({ warnings: z.array(forecastOverloadWarningSchema) });
export type ForecastLoadPreviewResponse = z.infer<typeof forecastLoadPreviewResponseSchema>;

/** Resultado de "Recalcular desde proyectos". */
export const forecastRecalculateResponseSchema = z.object({
  segments: z.number().int(),
  tasks: z.number().int(),
});
export type ForecastRecalculateResponse = z.infer<typeof forecastRecalculateResponseSchema>;

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
