import { and, eq, isNull } from 'drizzle-orm';
import { createDatabaseConnection } from './client';
import { hourEntries, ticketHhRequests, tickets } from './schema';

/**
 * Crea el `hour_entries` pendiente y vinculado que le falta a cada
 * `ticket_hh_requests` pendiente creada ANTES de que
 * `CreateTicketHhRequestUseCase` empezara a crearlo de inmediato (ver
 * docs/DECISION-M5-TICKETS.md) — sin este backfill, esas solicitudes siguen
 * siendo invisibles en "Aprobaciones de horas" aunque ya se vean en su
 * ticket. Corre una sola vez, manualmente, después de desplegar ese cambio.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');

  const { db, close } = createDatabaseConnection({ url, maxConnections: 1 });

  try {
    const rows = await db
      .select({
        id: ticketHhRequests.id,
        projectId: ticketHhRequests.projectId,
        userId: ticketHhRequests.userId,
        date: ticketHhRequests.date,
        hours: ticketHhRequests.hours,
        note: ticketHhRequests.note,
        isOvertime: ticketHhRequests.isOvertime,
        ticketId: tickets.id,
        ticketLegacyId: tickets.legacyId,
      })
      .from(ticketHhRequests)
      .innerJoin(tickets, eq(tickets.id, ticketHhRequests.ticketId))
      .where(and(eq(ticketHhRequests.status, 'pending'), isNull(ticketHhRequests.hourEntryId)));

    for (const row of rows) {
      const ticketDisplayId = row.ticketLegacyId ?? row.ticketId;
      const [entry] = await db
        .insert(hourEntries)
        .values({
          userId: row.userId,
          projectId: row.projectId,
          assignment: 'Proyecto',
          category: 'Soporte',
          description: row.note ?? `Solicitud de HH — Ticket ${ticketDisplayId}`,
          hours: row.hours,
          date: row.date,
          isOvertime: row.isOvertime,
          status: 'pending',
        })
        .returning({ id: hourEntries.id });

      await db.update(ticketHhRequests).set({ hourEntryId: entry!.id }).where(eq(ticketHhRequests.id, row.id));
    }

    console.log(`ticket_hh_requests: ${rows.length} vinculadas a un hour_entries pendiente nuevo.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('Falló el backfill de hour_entries de solicitudes de HH de ticket:', error);
  process.exit(1);
});
