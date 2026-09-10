import { z } from 'zod';
import { arrayQueryParam, isoDateTimeSchema, nonEmptyTrimmed, pageSchema, paginationQuerySchema, sortDirectionSchema, uuidSchema } from '../common/primitives';

/** Ver docs/DECISION-M5-TICKETS.md. */

export const TICKET_STATUSES = ['pending', 'in_progress', 'in_testing', 'done', 'closed'] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  pending: 'Pendiente',
  in_progress: 'En Proceso',
  in_testing: 'En Pruebas',
  done: 'Terminado',
  closed: 'Cerrado',
};

/** Orden del flujo — permite saber si un cambio de estado avanza o retrocede. */
export const TICKET_STATUS_ORDER: Readonly<Record<TicketStatus, number>> = {
  pending: 0,
  in_progress: 1,
  in_testing: 2,
  done: 3,
  closed: 4,
};

/**
 * Siguiente paso legal de un avance forzado, replicando `nextStageIncidente`/
 * `nextStageMejora` de la v1: un ticket `improvement` pasa por `in_testing`,
 * cualquier otro tipo de servicio (o sin tipo) lo salta. `null` cuando el
 * estado ya es terminal (`closed`). Compartida entre API (valida el avance) y
 * web (deshabilita las opciones que no son el siguiente paso legal).
 */
export function nextForwardTicketStatus(current: TicketStatus, serviceType: TicketServiceType | null): TicketStatus | null {
  switch (current) {
    case 'pending':
      return 'in_progress';
    case 'in_progress':
      return serviceType === 'improvement' ? 'in_testing' : 'done';
    case 'in_testing':
      return 'done';
    case 'done':
      return 'closed';
    case 'closed':
      return null;
  }
}

export const TICKET_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const TICKET_PRIORITY_LABELS: Readonly<Record<TicketPriority, string>> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const TICKET_SERVICE_TYPES = ['incident', 'inquiry', 'improvement', 'bug'] as const;
export const ticketServiceTypeSchema = z.enum(TICKET_SERVICE_TYPES);
export type TicketServiceType = z.infer<typeof ticketServiceTypeSchema>;

export const TICKET_SERVICE_TYPE_LABELS: Readonly<Record<TicketServiceType, string>> = {
  incident: 'Incidente',
  inquiry: 'Consulta',
  improvement: 'Mejora',
  bug: 'Error',
};

/**
 * "Consulta" e "Error" quedaron deprecados como tipo de servicio (se dejan
 * en `TICKET_SERVICE_TYPES`/`ticketServiceTypeSchema` solo para no romper la
 * lectura ni la edición de tickets históricos que ya los tienen). Los
 * tickets nuevos solo pueden ser Incidente o Mejora.
 */
export const SELECTABLE_TICKET_SERVICE_TYPES = ['incident', 'improvement'] as const satisfies readonly TicketServiceType[];
export const selectableTicketServiceTypeSchema = z.enum(SELECTABLE_TICKET_SERVICE_TYPES);

export const ticketHistoryEntrySchema = z.object({
  id: uuidSchema,
  eventType: z.string(),
  description: z.string(),
  /** Detalle estructurado del evento (valores antes/después, horas solicitadas, etc.) — opaco, cada `eventType` define sus propias claves. */
  metadata: z.record(z.string(), z.unknown()),
  actorName: z.string().nullable(),
  occurredAt: isoDateTimeSchema,
});
export type TicketHistoryEntry = z.infer<typeof ticketHistoryEntrySchema>;

export const ticketSummarySchema = z.object({
  id: uuidSchema,
  code: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  resolution: z.string().nullable(),
  client: z.object({ id: uuidSchema, companyName: z.string() }).nullable(),
  project: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  /** Iniciales del líder del proyecto de soporte — "Líder Soporte" en la v1. */
  supportLeaderInitials: z.string().nullable(),
  developmentProject: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  serviceType: ticketServiceTypeSchema.nullable(),
  priority: ticketPrioritySchema.nullable(),
  status: ticketStatusSchema,
  assignee: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  estimatedHours: z.number().int().nullable(),
  usedHours: z.number(),
  /** Solicitudes de HH del ticket en estado `pending` — para avisar en el listado que hay horas por aprobar sin abrir la ficha. */
  pendingHhRequestsCount: z.number().int(),
  pendingHhHours: z.number(),
  createdAt: isoDateTimeSchema,
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

export const ticketDetailSchema = ticketSummarySchema.extend({
  evidenceUrl: z.string().nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
  history: z.array(ticketHistoryEntrySchema),
  legacyId: z.string().nullable(),
  updatedAt: isoDateTimeSchema,
  /**
   * Calculado por el servidor con el mismo criterio que `canModifyTicket` en
   * la v1: no depende solo del rol — un actor sin `tickets:manage` igual
   * puede gestionar ESTE ticket si es su responsable o tiene autoridad sobre
   * su proyecto (líder o líder de un equipo asignado a él).
   */
  canManage: z.boolean(),
  /** Más restrictivo que `canManage` — ver `DeleteTicketUseCase`. */
  canDelete: z.boolean(),
  /**
   * Más restrictivo que `canManage`: a diferencia de este, el simple
   * responsable ("colaborador") sin autoridad sobre el proyecto NO puede
   * editar el ticket completo — solo cargar su solución al completarlo (ver
   * `UpdateTicketUseCase`). Gatilla el botón "Editar" en el front.
   */
  canEditDetails: z.boolean(),
  /**
   * Réplica de `canRegisterTicketHH` (v1) — a propósito NO incluye
   * `tickets:manage`: un admin/PMO que solo supervisa no debe poder cargar
   * horas de un ticket ajeno, solo su responsable o quien tiene autoridad
   * real sobre el proyecto, y nunca sobre un ticket cerrado.
   */
  canRequestHh: z.boolean(),
  /** Habilitado por el líder del proyecto/equipo — sin esto, no se pueden solicitar HH marcadas como horas extra en este ticket. */
  allowsOvertime: z.boolean(),
  /** Igual que `canRequestHh` pero para decidir SI el ticket admite horas extra — no basta con ser el simple responsable, ver `UpdateTicketUseCase`. */
  canAuthorizeOvertime: z.boolean(),
  /** Quién decide las solicitudes de HH de este ticket (líder de equipo del responsable, o líder de proyecto a falta de ese líder) — mismo criterio que `canRequestHh`/`isProjectApprover`, para mostrarlo al enviar una solicitud. */
  hhApprovers: z.array(z.object({ id: uuidSchema, fullName: z.string() })),
});
export type TicketDetail = z.infer<typeof ticketDetailSchema>;

export const createTicketSchema = z.object({
  title: nonEmptyTrimmed(300, 'El título'),
  clientId: uuidSchema.nullish(),
  projectId: uuidSchema.nullish(),
  developmentProjectId: uuidSchema.nullish(),
  serviceType: selectableTicketServiceTypeSchema.nullish(),
  description: z.string().trim().max(400).optional(),
  evidenceUrl: z.string().trim().max(500).optional(),
  priority: ticketPrioritySchema.nullish(),
  assigneeUserId: uuidSchema.nullish(),
  estimatedHours: z.coerce.number().int().min(0).nullish(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: nonEmptyTrimmed(300, 'El título').optional(),
  developmentProjectId: uuidSchema.nullish(),
  serviceType: ticketServiceTypeSchema.nullish(),
  description: z.string().trim().max(400).optional(),
  evidenceUrl: z.string().trim().max(500).optional(),
  priority: ticketPrioritySchema.nullish(),
  assigneeUserId: uuidSchema.nullish(),
  estimatedHours: z.coerce.number().int().min(0).nullish(),
  resolution: z.string().trim().max(4000).optional(),
  allowsOvertime: z.boolean().optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const changeTicketStatusSchema = z.object({ status: ticketStatusSchema });
export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusSchema>;

export const ticketSortFieldSchema = z.enum(['createdAt', 'status', 'priority']);
export type TicketSortField = z.infer<typeof ticketSortFieldSchema>;

export const listTicketsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  clientId: arrayQueryParam(uuidSchema),
  projectId: uuidSchema.optional(),
  assigneeUserId: arrayQueryParam(uuidSchema),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  sortField: ticketSortFieldSchema.default('createdAt'),
  sortDirection: sortDirectionSchema.default('desc'),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const listTicketsResponseSchema = pageSchema(ticketSummarySchema);
export type ListTicketsResponse = z.infer<typeof listTicketsResponseSchema>;

export const supportPlanAvailabilitySchema = z.object({
  hasActiveUsablePlan: z.boolean(),
  plan: z
    .object({
      id: uuidSchema,
      planType: z.enum(['monthly', 'bundle', 'on_demand']),
      contractedHours: z.number(),
      currentPeriod: z
        .object({
          startDate: z.string(),
          endDate: z.string(),
          contractedHours: z.number(),
          consumedHoursPeriod: z.number(),
          surplusHours: z.number(),
        })
        .nullable(),
    })
    .nullable(),
});
export type SupportPlanAvailability = z.infer<typeof supportPlanAvailabilitySchema>;
