import {
  and,
  auditLog,
  clientContacts,
  clients,
  eq,
  forecastAssignments,
  hourEntries,
  isNotNull,
  notInArray,
  projectTeamMembers,
  projectTeams,
  projects,
  supportMonthlyPeriods,
  supportPlans,
  ticketHistoryEntries,
  tickets,
} from '@kora/db';
import { StepTracker, type EtlContext } from './context';

/**
 * Borra, dentro de la misma transacción de `context.target`, las filas de
 * destino cuyo `legacy_id` ya no está en el dump recién cargado —el "borrando
 * lo que ya no está" del importador por archivo.
 *
 * Va al final del pipeline (después de todos los `migrate*`), en orden de
 * hijos antes que padres: aunque casi todas las FK relevantes son
 * `set null`/`cascade` (así que el orden no es estrictamente necesario para
 * que no falle), podar en este orden evita que un `cascade` borre de más
 * antes de que el paso "dueño" de esa tabla cuente lo que realmente borró.
 *
 * No se poda: catálogos (`countries/comunas/industries/business_sectors` —
 * casi estáticos y referenciados por todo lo demás; podarlos arriesga romper
 * referencias por una ausencia momentánea en el archivo) ni
 * `project_participation_history`/`project_observations` (ya hacen
 * *delete-all-and-reinsert* en cada corrida, dentro de `migrate-projects.ts`).
 */
export async function pruneStaleLegacyRows(context: EtlContext, dump: Readonly<Record<string, unknown[]>>): Promise<void> {
  const ids = (table: string, field: string): Array<string | number> => {
    const rows = dump[table] ?? [];
    return rows.map((row) => (row as Record<string, unknown>)[field]).filter((id): id is string | number => id != null);
  };

  await pruneOne(context, 'forecast_assignments', forecastAssignments, forecastAssignments.legacyId, ids('forecast_asignacion', 'id'));
  await pruneForecastAuditLog(context, ids('forecast_asignacion_log', 'id'));
  await pruneOne(context, 'ticket_history_entries', ticketHistoryEntries, ticketHistoryEntries.legacyId, ids('ticket_history', 'id'));
  await pruneOne(context, 'tickets', tickets, tickets.legacyId, ids('ticket', 'id_ticket'));
  await pruneOne(
    context,
    'support_monthly_periods',
    supportMonthlyPeriods,
    supportMonthlyPeriods.legacyId,
    ids('soporte_periodo_mensual', 'id'),
  );
  await pruneOne(context, 'support_plans', supportPlans, supportPlans.legacyId, ids('soporte_plan_contrato', 'id'));
  await pruneOne(context, 'hour_entries', hourEntries, hourEntries.legacyId, ids('registro_hh', 'id'));
  await pruneOne(context, 'project_team_members', projectTeamMembers, projectTeamMembers.legacyId, ids('proyecto_colaborador', 'id'));
  await pruneOne(context, 'project_teams', projectTeams, projectTeams.legacyId, ids('equipo_proyecto', 'id'));
  // `projects` ya se podó al principio de `migrateProjects` (antes del
  // upsert), no acá: un proyecto huérfano puede dejar libre un nombre que el
  // dump le da a OTRO proyecto en el mismo `proyecto_client_name_key`, y
  // podar recién al final del pipeline es tarde para eso — ver el comentario
  // en `migrate-projects.ts`.
  await pruneOne(context, 'client_contacts', clientContacts, clientContacts.legacyId, ids('contacto_cliente', 'id_contacto'));
  await pruneOne(context, 'clients', clients, clients.legacyId, ids('cliente', 'id_cliente'));
}

type PruneableTable =
  | typeof clients
  | typeof clientContacts
  | typeof projects
  | typeof projectTeams
  | typeof projectTeamMembers
  | typeof tickets
  | typeof ticketHistoryEntries
  | typeof supportPlans
  | typeof supportMonthlyPeriods
  | typeof hourEntries
  | typeof forecastAssignments;

/**
 * `legacyIdColumn` es uuid en unas tablas, varchar en otras, integer en el
 * resto — cada llamada ya pasa el id correcto para su columna (construido por
 * `ids(...)` arriba), así que el tipo se relaja a `any` acá adentro en vez de
 * pelear con los genéricos de Drizzle por un helper interno de un solo uso.
 */
export async function pruneOne(
  context: EtlContext,
  label: string,
  table: PruneableTable,
  legacyIdColumn: PruneableTable['legacyId'],
  currentLegacyIds: Array<string | number>,
): Promise<void> {
  const tracker = new StepTracker(`poda: ${label}`);

  if (currentLegacyIds.length === 0) {
    tracker.warn(`el archivo no trae filas de origen para "${label}"; se borran todas las filas migradas previamente`);
  }

  const col = legacyIdColumn as unknown as Parameters<typeof isNotNull>[0];
  const where =
    currentLegacyIds.length === 0 ? isNotNull(col) : and(isNotNull(col), notInArray(col as any, currentLegacyIds as never[]));

  const deletedRows = await context.target.delete(table).where(where).returning({ id: table.id });
  tracker.deleted = deletedRows.length;

  context.report.add(tracker.toResult());
}

async function pruneForecastAuditLog(context: EtlContext, currentLegacyIds: Array<string | number>): Promise<void> {
  const tracker = new StepTracker('poda: historial de forecast');

  if (currentLegacyIds.length === 0) {
    tracker.warn('el archivo no trae filas de origen para "forecast_asignacion_log"; se borran todas las filas migradas previamente');
  }

  const scoped = eq(auditLog.entityType, 'forecast_assignment');
  const col = auditLog.legacyId as unknown as Parameters<typeof isNotNull>[0];
  const where =
    currentLegacyIds.length === 0
      ? and(scoped, isNotNull(col))
      : and(scoped, isNotNull(col), notInArray(col as any, currentLegacyIds as never[]));

  const deletedRows = await context.target.delete(auditLog).where(where).returning({ id: auditLog.id });
  tracker.deleted = deletedRows.length;

  context.report.add(tracker.toResult());
}
