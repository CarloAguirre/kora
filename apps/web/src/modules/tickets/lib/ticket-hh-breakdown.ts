import type { TicketHhRequest } from '@kora/contracts';

export interface TicketHhBreakdownEntry {
  readonly userId: string;
  readonly fullName: string;
  readonly hours: number;
}

/** "HH registradas por persona" (v1) — solicitudes ya aprobadas, sumadas por colaborador. */
export function computeApprovedHhBreakdown(requests: readonly TicketHhRequest[] | undefined): TicketHhBreakdownEntry[] {
  const byUser = new Map<string, TicketHhBreakdownEntry>();
  for (const request of requests ?? []) {
    if (request.status !== 'approved') continue;
    const existing = byUser.get(request.user.id);
    if (existing) {
      byUser.set(request.user.id, { ...existing, hours: existing.hours + request.hours });
    } else {
      byUser.set(request.user.id, { userId: request.user.id, fullName: request.user.fullName, hours: request.hours });
    }
  }
  return [...byUser.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}
