import { z } from 'zod';
import { isoDateTimeSchema, nonEmptyTrimmed, uuidSchema } from '../common/primitives';

/**
 * Solicitud de horas desde un ticket — "siguiente paso de M5", ver
 * docs/DECISION-M5-TICKETS.md. Al aprobarse genera un `hour_entries` ya
 * aprobado (`hourEntryId`).
 */

export const TICKET_HH_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const ticketHhRequestStatusSchema = z.enum(TICKET_HH_REQUEST_STATUSES);
export type TicketHhRequestStatus = z.infer<typeof ticketHhRequestStatusSchema>;

export const TICKET_HH_REQUEST_STATUS_LABELS: Readonly<Record<TicketHhRequestStatus, string>> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export const ticketHhRequestSchema = z.object({
  id: uuidSchema,
  ticketId: uuidSchema,
  project: z.object({ id: uuidSchema, name: z.string() }),
  user: z.object({ id: uuidSchema, fullName: z.string() }),
  date: z.string(),
  hours: z.number(),
  note: z.string().nullable(),
  isOvertime: z.boolean(),
  status: ticketHhRequestStatusSchema,
  rejectionReason: z.string().nullable(),
  reviewedBy: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  hourEntryId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type TicketHhRequest = z.infer<typeof ticketHhRequestSchema>;

export const createTicketHhRequestSchema = z.object({
  date: z.iso.date(),
  hours: z.coerce.number().positive('Las horas deben ser mayores a 0.').max(24, 'No puede solicitar más de 24 horas en un día.'),
  note: z.string().trim().max(500).optional(),
});
export type CreateTicketHhRequestInput = z.infer<typeof createTicketHhRequestSchema>;

export const rejectTicketHhRequestSchema = z.object({ reason: nonEmptyTrimmed(500, 'El motivo de rechazo') });
export type RejectTicketHhRequestInput = z.infer<typeof rejectTicketHhRequestSchema>;

export const listTicketHhRequestsResponseSchema = z.array(ticketHhRequestSchema);
export type ListTicketHhRequestsResponse = z.infer<typeof listTicketHhRequestsResponseSchema>;
