/**
 * Sincroniza el lado de tickets cuando un `hour_entries` vinculado a una
 * solicitud de HH de ticket (`ticket_hh_requests.hour_entry_id`) se aprueba o
 * rechaza desde la cola general de "Aprobaciones de horas" — mismos efectos
 * que produce aprobar/rechazar directamente desde el ticket (transición de la
 * solicitud, `ticket.usedHours`, historial del ticket).
 *
 * Es no-op si el `hour_entries` no tiene una solicitud de ticket vinculada
 * (caso común): cada método hace su propio lookup por `hourEntryId`, una sola
 * consulta indexada.
 *
 * `TicketsModule` ya importa `HoursModule` (por `HOUR_ENTRY_REPOSITORY`), así
 * que este puerto se implementa dentro de `hours/infrastructure` en vez de
 * `HoursModule` importar `TicketsModule` de vuelta (evita un ciclo) — ver
 * docs/DECISION-M5-TICKETS.md.
 */
export interface TicketHhRequestSyncPort {
  onHourEntryApproved(hourEntryId: string, actorUserId: string, now: Date): Promise<void>;
  onHourEntryRejected(hourEntryId: string, actorUserId: string, reason: string, now: Date): Promise<void>;
}

export const TICKET_HH_REQUEST_SYNC = Symbol('TicketHhRequestSyncPort');
