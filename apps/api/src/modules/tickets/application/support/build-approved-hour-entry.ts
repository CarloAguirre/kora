import type { IdGenerator, Result } from '@kora/core';
import { HourEntry, type CreateHourEntryError } from '../../../hours/domain/entities/hour-entry.entity';

export interface BuildApprovedHourEntryParams {
  readonly ids: IdGenerator;
  readonly userId: string;
  readonly projectId: string;
  readonly hours: number;
  readonly date: Date;
  readonly note: string | null;
  readonly ticketDisplayId: string;
  readonly now: Date;
}

/**
 * Construye el `hour_entries` ya aprobado que resulta de aprobar (o
 * autoaprobar) una solicitud de HH de ticket — mismo bloque usado por
 * `approve-ticket-hh-request.use-case.ts` y por la autoaprobación en
 * `create-ticket-hh-request.use-case.ts`. Ver docs/DECISION-M5-TICKETS.md.
 */
export function buildApprovedHourEntry(params: BuildApprovedHourEntryParams): Result<HourEntry, CreateHourEntryError> {
  return HourEntry.create({
    id: params.ids.generate(),
    userId: params.userId,
    projectId: params.projectId,
    assignment: 'Proyecto',
    category: 'Soporte',
    description: params.note ?? `Solicitud de HH — Ticket ${params.ticketDisplayId}`,
    hours: params.hours,
    date: params.date,
    ownerRequiresApproval: false,
    now: params.now,
  });
}
