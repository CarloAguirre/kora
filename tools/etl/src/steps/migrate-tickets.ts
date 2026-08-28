import {
  clients,
  eq,
  isNotNull,
  projects,
  supportMonthlyPeriods,
  supportPlans,
  ticketHistoryEntries,
  tickets,
  users,
} from '@kora/db';
import type { TicketPriority, TicketServiceType, TicketStatus } from '@kora/contracts';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Migra `ticket`, `ticket_history`, `soporte_plan_contrato` y
 * `soporte_periodo_mensual` — ver docs/DECISION-M5-TICKETS.md para lo que
 * queda fuera de esta pasada.
 */

const STATUS_MAP: Readonly<Record<number, TicketStatus>> = {
  1: 'pending',
  2: 'in_progress',
  3: 'in_testing',
  4: 'done',
  5: 'closed',
};

const PRIORITY_MAP: Readonly<Record<number, TicketPriority>> = {
  1: 'critical',
  2: 'high',
  3: 'medium',
  4: 'low',
};

const SERVICE_TYPE_MAP: Readonly<Record<number, TicketServiceType>> = {
  1: 'incident',
  2: 'inquiry',
  3: 'improvement',
  4: 'bug',
};

const PLAN_TYPE_MAP: Readonly<Record<string, 'monthly' | 'bundle' | 'on_demand'>> = {
  mensual: 'monthly',
  bolsa: 'bundle',
  a_demanda: 'on_demand',
};

const SURPLUS_POLICY_MAP: Readonly<Record<string, 'accumulate' | 'expire'>> = {
  Acumulables: 'accumulate',
  Expiran: 'expire',
};

interface LegacyTicket {
  id_ticket: string;
  id_cliente: number | null;
  id_proyecto: number | null;
  id_proyecto_desarrollo: number | null;
  titulo_ticket: string;
  id_tipo_servi: number | null;
  descrip_incidente: string | null;
  evidencia_incidente: string | null;
  id_responsable: number | null;
  id_criticidad: number | null;
  hh_estimadas: number | null;
  id_estado_ticket: number;
  solucion: string | null;
  fecha_solucion: Date | null;
  hh_utilizadas: string;
  created_at: Date;
  updated_at: Date;
}

interface LegacyTicketHistory {
  id: string;
  id_ticket: string | null;
  event_type: string | null;
  descripcion: string;
  metadata: unknown;
  actor_user_id: string | null;
  actor_id_usuario: number | null;
  occurred_at: Date;
}

interface LegacySupportPlan {
  id: number;
  id_cliente: number;
  id_proyecto: number;
  tipo_plan: string;
  politica_sobrantes_mensual: string | null;
  estado: string;
  fecha_inicio: Date;
  fecha_fin: Date | null;
  hh_contratadas: string;
  valor_plan_uf: string;
  valor_hh_extra_uf: string;
}

interface LegacySupportPeriod {
  id: number;
  id_plan_contrato: number;
  id_proyecto: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  politica_sobrantes: string;
  hh_contratadas: string;
  hh_saldo_reutilizado: string;
  hh_consumidas_inicio: string;
  hh_consumidas_fin: string | null;
  hh_consumidas_periodo: string;
  hh_sobrantes: string;
  estado: string;
}

export async function migrateTickets(context: EtlContext): Promise<void> {
  const clientIds = await loadLegacyIntIdMap(context, clients);
  const projectIds = await loadLegacyIntIdMap(context, projects);
  const userIdsByLegacyId = await loadUserIdsByLegacyId(context);
  const userIdsByLegacyAuth = await loadUserIdsByLegacyAuthId(context);

  await migrateSupportPlans(context, clientIds, projectIds);
  await migrateTicketRows(context, clientIds, projectIds, userIdsByLegacyId);
  await migrateTicketHistory(context, userIdsByLegacyAuth, userIdsByLegacyId);
}

async function migrateTicketRows(
  context: EtlContext,
  clientIds: Map<number, string>,
  projectIds: Map<number, string>,
  userIdsByLegacyId: Map<number, string>,
): Promise<void> {
  const tracker = new StepTracker('tickets');

  const rows = (await context.legacyReader.getRows<LegacyTicket>('ticket')).sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  tracker.read = rows.length;

  for (const row of rows) {
    const status = STATUS_MAP[row.id_estado_ticket];
    if (!status) {
      tracker.warn(`ticket ${row.id_ticket}: estado ${row.id_estado_ticket} desconocido, se omite`);
      tracker.skipped += 1;
      continue;
    }

    const clientId = row.id_cliente ? (clientIds.get(row.id_cliente) ?? null) : null;
    const projectId = row.id_proyecto ? (projectIds.get(row.id_proyecto) ?? null) : null;
    const developmentProjectId = row.id_proyecto_desarrollo ? (projectIds.get(row.id_proyecto_desarrollo) ?? null) : null;
    const assigneeUserId = row.id_responsable ? (userIdsByLegacyId.get(row.id_responsable) ?? null) : null;

    const values = {
      clientId,
      projectId,
      developmentProjectId,
      title: row.titulo_ticket.trim(),
      serviceType: row.id_tipo_servi ? (SERVICE_TYPE_MAP[row.id_tipo_servi] ?? null) : null,
      description: row.descrip_incidente?.trim() || null,
      evidenceUrl: row.evidencia_incidente?.trim() || null,
      assigneeUserId,
      priority: row.id_criticidad ? (PRIORITY_MAP[row.id_criticidad] ?? null) : null,
      estimatedHours: row.hh_estimadas,
      status,
      resolution: row.solucion?.trim() || null,
      resolvedAt: row.fecha_solucion,
      usedHours: row.hh_utilizadas,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const existing = await context.target.select({ id: tickets.id }).from(tickets).where(eq(tickets.legacyId, row.id_ticket)).limit(1);

    if (existing[0]) {
      await context.target.update(tickets).set(values).where(eq(tickets.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(tickets).values({ legacyId: row.id_ticket, ...values });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

async function migrateTicketHistory(
  context: EtlContext,
  userIdsByLegacyAuth: Map<string, string>,
  userIdsByLegacyId: Map<number, string>,
): Promise<void> {
  const tracker = new StepTracker('historial de tickets');

  const rows = (await context.legacyReader.getRows<LegacyTicketHistory>('ticket_history')).sort(
    (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime(),
  );
  tracker.read = rows.length;

  const ticketIdsByLegacy = await loadLegacyVarcharIdMap(context, tickets);

  for (const row of rows) {
    const ticketId = row.id_ticket ? (ticketIdsByLegacy.get(row.id_ticket) ?? null) : null;
    if (!ticketId) {
      tracker.warn(`historial ${row.id}: el ticket ${row.id_ticket ?? 'nulo'} no existe en destino`);
      tracker.skipped += 1;
      continue;
    }

    const actorUserId = row.actor_user_id
      ? (userIdsByLegacyAuth.get(row.actor_user_id) ?? null)
      : row.actor_id_usuario
        ? (userIdsByLegacyId.get(row.actor_id_usuario) ?? null)
        : null;

    const values = {
      ticketId,
      eventType: row.event_type?.trim() || 'unknown',
      description: row.descripcion,
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      actorUserId,
      occurredAt: row.occurred_at,
    };

    const existing = await context.target
      .select({ id: ticketHistoryEntries.id })
      .from(ticketHistoryEntries)
      .where(eq(ticketHistoryEntries.legacyId, row.id))
      .limit(1);

    if (existing[0]) {
      await context.target.update(ticketHistoryEntries).set(values).where(eq(ticketHistoryEntries.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(ticketHistoryEntries).values({ legacyId: row.id, ...values });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

async function migrateSupportPlans(context: EtlContext, clientIds: Map<number, string>, projectIds: Map<number, string>): Promise<void> {
  const planTracker = new StepTracker('planes de soporte');

  const planRows = (await context.legacyReader.getRows<LegacySupportPlan>('soporte_plan_contrato')).sort((a, b) => a.id - b.id);
  planTracker.read = planRows.length;

  const planIdsByLegacy = new Map<number, string>();

  for (const row of planRows) {
    const clientId = clientIds.get(row.id_cliente);
    const projectId = projectIds.get(row.id_proyecto);
    if (!clientId || !projectId) {
      planTracker.warn(`plan ${row.id}: cliente ${row.id_cliente} o proyecto ${row.id_proyecto} no existe en destino`);
      planTracker.skipped += 1;
      continue;
    }

    const values = {
      clientId,
      projectId,
      planType: PLAN_TYPE_MAP[row.tipo_plan] ?? 'on_demand',
      surplusPolicy: row.politica_sobrantes_mensual ? (SURPLUS_POLICY_MAP[row.politica_sobrantes_mensual] ?? null) : null,
      status: row.estado as 'active' | 'ended' | 'cancelled',
      startDate: row.fecha_inicio,
      endDate: row.fecha_fin,
      contractedHours: row.hh_contratadas,
      planValueUf: row.valor_plan_uf,
      extraHourValueUf: row.valor_hh_extra_uf,
    };

    const existing = await context.target.select({ id: supportPlans.id }).from(supportPlans).where(eq(supportPlans.legacyId, row.id)).limit(1);

    let planId: string;
    if (existing[0]) {
      await context.target.update(supportPlans).set({ ...values, updatedAt: new Date() }).where(eq(supportPlans.id, existing[0].id));
      planId = existing[0].id;
      planTracker.updated += 1;
    } else {
      const inserted = await context.target.insert(supportPlans).values({ legacyId: row.id, ...values }).returning({ id: supportPlans.id });
      planId = inserted[0]!.id;
      planTracker.created += 1;
    }
    planIdsByLegacy.set(row.id, planId);
  }

  context.report.add(planTracker.toResult());

  const periodTracker = new StepTracker('períodos mensuales de soporte');

  const periodRows = (await context.legacyReader.getRows<LegacySupportPeriod>('soporte_periodo_mensual')).sort((a, b) => a.id - b.id);
  periodTracker.read = periodRows.length;

  for (const row of periodRows) {
    const planId = planIdsByLegacy.get(row.id_plan_contrato);
    const projectId = projectIds.get(row.id_proyecto);
    if (!planId || !projectId) {
      periodTracker.warn(`período ${row.id}: plan ${row.id_plan_contrato} o proyecto ${row.id_proyecto} no existe en destino`);
      periodTracker.skipped += 1;
      continue;
    }

    const values = {
      planId,
      projectId,
      startDate: row.fecha_inicio,
      endDate: row.fecha_fin,
      surplusPolicy: SURPLUS_POLICY_MAP[row.politica_sobrantes] ?? 'expire',
      contractedHours: row.hh_contratadas,
      reusedBalanceHours: row.hh_saldo_reutilizado,
      consumedHoursStart: row.hh_consumidas_inicio,
      consumedHoursEnd: row.hh_consumidas_fin,
      consumedHoursPeriod: row.hh_consumidas_periodo,
      surplusHours: row.hh_sobrantes,
      status: row.estado as 'active' | 'expired' | 'closed' | 'cancelled',
    };

    const existing = await context.target
      .select({ id: supportMonthlyPeriods.id })
      .from(supportMonthlyPeriods)
      .where(eq(supportMonthlyPeriods.legacyId, row.id))
      .limit(1);

    if (existing[0]) {
      await context.target
        .update(supportMonthlyPeriods)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(supportMonthlyPeriods.id, existing[0].id));
      periodTracker.updated += 1;
    } else {
      await context.target.insert(supportMonthlyPeriods).values({ legacyId: row.id, ...values });
      periodTracker.created += 1;
    }
  }

  context.report.add(periodTracker.toResult());
}

async function loadLegacyIntIdMap(
  context: EtlContext,
  table: typeof clients | typeof projects,
): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: table.id, legacyId: table.legacyId }).from(table);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

async function loadLegacyVarcharIdMap(context: EtlContext, table: typeof tickets): Promise<Map<string, string>> {
  const rows = await context.target.select({ id: table.id, legacyId: table.legacyId }).from(table);
  const map = new Map<string, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

async function loadUserIdsByLegacyId(context: EtlContext): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: users.id, legacyId: users.legacyId }).from(users);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

async function loadUserIdsByLegacyAuthId(context: EtlContext): Promise<Map<string, string>> {
  const rows = await context.target
    .select({ id: users.id, legacyAuthUserId: users.legacyAuthUserId })
    .from(users)
    .where(isNotNull(users.legacyAuthUserId));

  const map = new Map<string, string>();
  for (const row of rows) if (row.legacyAuthUserId) map.set(row.legacyAuthUserId, row.id);
  return map;
}
