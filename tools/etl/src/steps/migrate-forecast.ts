import { auditLog, clients, eq, forecastAssignments, isNotNull, projects, teamMembers, teams, users } from '@kora/db';
import type { ForecastAssignmentType } from '@kora/contracts';
import { StepTracker, type EtlContext } from '../lib/context';

/**
 * Migra `forecast_asignacion` → `forecast_assignments` y
 * `forecast_asignacion_log` → `audit_log` (con `entity_type =
 * 'forecast_assignment'`) — ver docs/DECISION-M6-FORECAST.md.
 */

const TYPE_MAP: Readonly<Record<string, ForecastAssignmentType>> = {
  Proyecto: 'project',
  Soporte: 'support',
  Vacaciones: 'vacation',
  'Día administrativo': 'admin_day',
  'Día libre': 'day_off',
  'Licencia médica': 'sick_leave',
  Capacitación: 'training',
  Otros: 'other',
};

const AUDIT_ACTION_MAP: Readonly<Record<string, 'create' | 'update' | 'delete'>> = {
  created: 'create',
  updated: 'update',
  deleted: 'delete',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface LegacyForecastAssignment {
  id: number;
  id_miembro: number;
  periodo_inicio: Date;
  periodo_fin: Date;
  tipo: string;
  id_proyecto: number | null;
  id_cliente: number | null;
  comentarios: string;
  hh_asignadas: string;
  created_at: Date;
  updated_at: Date;
}

interface LegacyForecastLog {
  id: number;
  action: string;
  id_asignacion: number | null;
  id_miembro: number | null;
  miembro_nombre: string | null;
  id_equipo: number | null;
  equipo_nombre: string | null;
  periodo_inicio: Date;
  periodo_fin: Date;
  tipo: string | null;
  id_proyecto: number | null;
  proyecto_nombre: string | null;
  id_cliente: number | null;
  cliente_nombre: string | null;
  hh_asignadas: string | null;
  comentarios: string | null;
  actor_user_id: string | null;
  actor_id_usuario: number | null;
  actor_nombre: string | null;
  created_at: Date;
}

export async function migrateForecast(context: EtlContext): Promise<void> {
  const memberIds = await loadLegacyIntIdMap(context, teamMembers);
  const clientIds = await loadLegacyIntIdMap(context, clients);
  const projectIds = await loadLegacyIntIdMap(context, projects);
  const teamIds = await loadLegacyIntIdMap(context, teams);
  const userIdsByLegacyId = await loadUserIdsByLegacyId(context);
  const userIdsByLegacyAuth = await loadUserIdsByLegacyAuthId(context);

  const assignmentIds = await migrateAssignments(context, memberIds, clientIds, projectIds);
  await migrateHistory(context, { assignmentIds, teamIds, userIdsByLegacyId, userIdsByLegacyAuth });
}

async function migrateAssignments(
  context: EtlContext,
  memberIds: Map<number, string>,
  clientIds: Map<number, string>,
  projectIds: Map<number, string>,
): Promise<Map<number, string>> {
  const tracker = new StepTracker('asignaciones de forecast');
  const assignmentIdsByLegacy = new Map<number, string>();

  const rows = (await context.legacyReader.getRows<LegacyForecastAssignment>('forecast_asignacion')).sort((a, b) => a.id - b.id);
  tracker.read = rows.length;

  for (const row of rows) {
    const memberId = memberIds.get(row.id_miembro);
    if (!memberId) {
      tracker.warn(`asignación ${row.id}: el miembro ${row.id_miembro} no existe en destino`);
      tracker.skipped += 1;
      continue;
    }

    const type = TYPE_MAP[row.tipo.trim()];
    if (!type) {
      tracker.warn(`asignación ${row.id}: tipo "${row.tipo}" no reconocido, se omite`);
      tracker.skipped += 1;
      continue;
    }

    if (!isFullWorkWeek(row.periodo_inicio, row.periodo_fin)) {
      tracker.warn(
        `asignación ${row.id}: el período ${row.periodo_inicio.toISOString().slice(0, 10)} → ${row.periodo_fin.toISOString().slice(0, 10)} no es una semana laboral completa, se omite`,
      );
      tracker.skipped += 1;
      continue;
    }

    const hours = Number(row.hh_asignadas);
    if (!Number.isFinite(hours) || hours < 0) {
      tracker.warn(`asignación ${row.id}: HH asignadas inválidas ("${row.hh_asignadas}"), se omite`);
      tracker.skipped += 1;
      continue;
    }

    const values = {
      teamMemberId: memberId,
      periodStart: row.periodo_inicio,
      periodEnd: row.periodo_fin,
      type,
      projectId: row.id_proyecto ? (projectIds.get(row.id_proyecto) ?? null) : null,
      clientId: row.id_cliente ? (clientIds.get(row.id_cliente) ?? null) : null,
      comments: row.comentarios?.trim() || '',
      assignedHours: String(hours),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const existing = await context.target
      .select({ id: forecastAssignments.id })
      .from(forecastAssignments)
      .where(eq(forecastAssignments.legacyId, row.id))
      .limit(1);

    let assignmentId: string;
    if (existing[0]) {
      await context.target.update(forecastAssignments).set(values).where(eq(forecastAssignments.id, existing[0].id));
      assignmentId = existing[0].id;
      tracker.updated += 1;
    } else {
      const inserted = await context.target
        .insert(forecastAssignments)
        .values({ legacyId: row.id, ...values })
        .returning({ id: forecastAssignments.id });
      assignmentId = inserted[0]!.id;
      tracker.created += 1;
    }
    assignmentIdsByLegacy.set(row.id, assignmentId);
  }

  context.report.add(tracker.toResult());
  return assignmentIdsByLegacy;
}

async function migrateHistory(
  context: EtlContext,
  maps: {
    assignmentIds: Map<number, string>;
    teamIds: Map<number, string>;
    userIdsByLegacyId: Map<number, string>;
    userIdsByLegacyAuth: Map<string, string>;
  },
): Promise<void> {
  const tracker = new StepTracker('historial de forecast');

  const rows = (await context.legacyReader.getRows<LegacyForecastLog>('forecast_asignacion_log')).sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  tracker.read = rows.length;

  for (const row of rows) {
    const action = AUDIT_ACTION_MAP[row.action];
    if (!action) {
      tracker.warn(`historial ${row.id}: acción "${row.action}" no reconocida, se omite`);
      tracker.skipped += 1;
      continue;
    }

    // El id de la asignación puede no resolver: la propia v1 conserva estas filas
    // huérfanas cuando la asignación original ya fue borrada — se preserva el mismo dato.
    const entityId = row.id_asignacion !== null ? (maps.assignmentIds.get(row.id_asignacion) ?? null) : null;
    const teamId = row.id_equipo !== null ? (maps.teamIds.get(row.id_equipo) ?? null) : null;
    const actorUserId = row.actor_user_id
      ? (maps.userIdsByLegacyAuth.get(row.actor_user_id) ?? null)
      : row.actor_id_usuario
        ? (maps.userIdsByLegacyId.get(row.actor_id_usuario) ?? null)
        : null;

    const type = row.tipo ? (TYPE_MAP[row.tipo.trim()] ?? null) : null;

    const values = {
      actorUserId,
      actorEmail: null,
      action,
      entityType: 'forecast_assignment' as const,
      entityId,
      metadata: {
        teamId,
        teamName: row.equipo_nombre,
        periodStart: row.periodo_inicio.toISOString().slice(0, 10),
        periodEnd: row.periodo_fin.toISOString().slice(0, 10),
        memberFullName: row.miembro_nombre,
        type,
        projectName: row.proyecto_nombre,
        clientName: row.cliente_nombre,
        assignedHours: row.hh_asignadas !== null ? Number(row.hh_asignadas) : null,
        comments: row.comentarios,
        actorName: row.actor_nombre,
      },
      occurredAt: row.created_at,
    };

    const existing = await context.target.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.legacyId, row.id)).limit(1);

    if (existing[0]) {
      await context.target.update(auditLog).set(values).where(eq(auditLog.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(auditLog).values({ legacyId: row.id, ...values });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

function isFullWorkWeek(start: Date, end: Date): boolean {
  if (start.getUTCDay() !== 1) return false;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) === 4;
}

async function loadLegacyIntIdMap(
  context: EtlContext,
  table: typeof teamMembers | typeof clients | typeof projects | typeof teams,
): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: table.id, legacyId: table.legacyId }).from(table);
  const map = new Map<number, string>();
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
