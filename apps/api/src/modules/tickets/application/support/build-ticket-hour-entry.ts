import type { IdGenerator, Result } from '@kora/core';
import { HourEntry, type CreateHourEntryError } from '../../../hours/domain/entities/hour-entry.entity';

export interface BuildTicketHourEntryParams {
  readonly ids: IdGenerator;
  readonly userId: string;
  readonly projectId: string;
  readonly hours: number;
  readonly date: Date;
  readonly note: string | null;
  readonly isOvertime: boolean;
  readonly ticketDisplayId: string;
  /** `true` para la solicitud que queda pendiente de revisión; `false` para la autoaprobación. */
  readonly ownerRequiresApproval: boolean;
  readonly now: Date;
}

/**
 * Construye el `hour_entries` (pendiente o ya aprobado, según
 * `ownerRequiresApproval`) que resulta de una solicitud de HH de ticket —
 * usado por `create-ticket-hh-request.use-case.ts` (ambas ramas: pendiente y
 * autoaprobación). Ver docs/DECISION-M5-TICKETS.md.
 */
export function buildTicketHourEntry(params: BuildTicketHourEntryParams): Result<HourEntry, CreateHourEntryError> {
  return HourEntry.create({
    id: params.ids.generate(),
    userId: params.userId,
    projectId: params.projectId,
    assignment: 'Proyecto',
    category: 'Soporte',
    description: params.note ?? `Solicitud de HH — Ticket ${params.ticketDisplayId}`,
    hours: params.hours,
    date: params.date,
    isOvertime: params.isOvertime,
    ownerRequiresApproval: params.ownerRequiresApproval,
    now: params.now,
  });
}
