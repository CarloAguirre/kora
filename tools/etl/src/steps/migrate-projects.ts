import {
  clientContacts,
  clients,
  eq,
  projectObservations,
  projectParticipationHistory,
  projectTeamMembers,
  projectTeams,
  projects,
  teamMembers,
  teams,
  users,
} from '@kora/db';
import { StepTracker, type EtlContext } from '../lib/context';
import {
  mapPriority,
  mapProjectPhase,
  mapProjectStatus,
  mapProjectType,
  mapSalesStage,
} from '../lib/project-mapping';

interface LegacyProyectoRow {
  id_proyecto: number;
  nombre_proyecto: string;
  id_cliente: number | null;
  id_contacto: number | null;
  id_tipo_proyecto: number | null;
  etapa: string | null;
  fase_proyecto: string | null;
  estado_proyecto: string | null;
  prioridad: string | null;
  id_lider: number | null;
  id_desarrollador: number | null;
  id_res_comercial: number | null;
  fecha_inicio: Date | null;
  fecha_termino: Date | null;
  fecha_entrega_estimada: Date | null;
  hh_vendidas: string;
  hh_utilizadas: string;
  avance_esperado: number | null;
  avance_real: number | null;
  plan_soporte: string | null;
  soporte_horas: string;
  hora_extra_uf: string;
  link_cotizacion: string | null;
  link_contrato: string | null;
  link_adicionales: string | null;
}

interface LegacyTipoProyectoRow {
  id_tipo_proyecto: number;
  descrip_tipo_proyecto: string;
}

interface LegacyProjectRow {
  id_proyecto: number;
  nombre_proyecto: string;
  id_cliente: number | null;
  id_contacto: number | null;
  id_tipo_proyecto_desc: string | null;
  etapa: string | null;
  fase_proyecto: string | null;
  estado_proyecto: string | null;
  prioridad: string | null;
  id_lider: number | null;
  id_desarrollador: number | null;
  id_res_comercial: number | null;
  fecha_inicio: Date | null;
  fecha_termino: Date | null;
  fecha_entrega_estimada: Date | null;
  hh_vendidas: string;
  hh_utilizadas: string;
  avance_esperado: number | null;
  avance_real: number | null;
  plan_soporte: string | null;
  soporte_horas: string;
  hora_extra_uf: string;
  link_cotizacion: string | null;
  link_contrato: string | null;
  link_adicionales: string | null;
}

/**
 * Migra `proyecto` → `projects`, con sus equipos, miembros, historial de
 * participación y observaciones.
 *
 * Va después de clientes y equipos, y el orden interno importa: primero el
 * proyecto (para tener su id nuevo), luego lo que cuelga de él.
 */
export async function migrateProjects(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('proyectos');

  const proyectoRows = await context.legacyReader.getRows<LegacyProyectoRow>('proyecto');
  const tipoProyectoRows = await context.legacyReader.getRows<LegacyTipoProyectoRow>('tipo_proyecto');
  const tipoProyectoDescById = new Map(tipoProyectoRows.map((row) => [row.id_tipo_proyecto, row.descrip_tipo_proyecto]));

  const rows: LegacyProjectRow[] = proyectoRows
    .map((row) => ({
      ...row,
      id_tipo_proyecto_desc: row.id_tipo_proyecto != null ? (tipoProyectoDescById.get(row.id_tipo_proyecto) ?? null) : null,
    }))
    .sort((a, b) => a.id_proyecto - b.id_proyecto);
  tracker.read = rows.length;

  const clientIds = await loadLegacyIdMap(context, clients);
  const contactIds = await loadLegacyIdMap(context, clientContacts);
  const userIds = await loadLegacyIdMap(context, users);
  const managerUserIds = await loadCommercialManagerUserIds(context);

  for (const row of rows) {
    const type = mapProjectType(row.id_tipo_proyecto_desc);
    const salesStage = type === 'development' ? mapSalesStage(row.id_tipo_proyecto_desc) : null;

    if (type === 'development' && !salesStage) {
      tracker.warn(
        `proyecto ${row.id_proyecto}: tipo "${row.id_tipo_proyecto_desc}" no resuelve etapa comercial; se asume "approved"`,
      );
    }

    const clientId = row.id_cliente ? (clientIds.get(row.id_cliente) ?? null) : null;
    if (row.id_cliente && !clientId) {
      tracker.warn(`proyecto ${row.id_proyecto}: cliente ${row.id_cliente} no migrado`);
    }

    const values = {
      name: row.nombre_proyecto.trim(),
      clientId,
      primaryContactId: row.id_contacto ? (contactIds.get(row.id_contacto) ?? null) : null,
      type,
      salesStage: type === 'development' ? (salesStage ?? 'approved') : null,
      status: mapProjectStatus(row.etapa, row.fase_proyecto, row.estado_proyecto),
      phase: type === 'development' ? mapProjectPhase(row.fase_proyecto) : null,
      priority: mapPriority(row.prioridad),
      leaderUserId: row.id_lider ? (userIds.get(row.id_lider) ?? null) : null,
      developerUserId: row.id_desarrollador ? (userIds.get(row.id_desarrollador) ?? null) : null,
      commercialManagerUserId: row.id_res_comercial ? (managerUserIds.get(row.id_res_comercial) ?? null) : null,
      startDate: row.fecha_inicio,
      endDate: row.fecha_termino,
      estimatedDeliveryDate: row.fecha_entrega_estimada,
      soldHours: row.hh_vendidas,
      usedHours: row.hh_utilizadas,
      expectedProgress: row.avance_esperado,
      actualProgress: row.avance_real,
      supportPlanDescription: row.plan_soporte?.trim() || null,
      supportHours: row.soporte_horas,
      overtimeRateUf: row.hora_extra_uf,
      quotationLink: row.link_cotizacion?.trim() || null,
      contractLink: row.link_contrato?.trim() || null,
      additionalLinks: row.link_adicionales?.trim() || null,
    };

    const existing = await context.target
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.legacyId, row.id_proyecto))
      .limit(1);

    if (existing[0]) {
      await context.target.update(projects).set({ ...values, updatedAt: new Date() }).where(eq(projects.id, existing[0].id));
      tracker.updated += 1;
    } else {
      const inserted = await context.target.insert(projects).values({ legacyId: row.id_proyecto, ...values }).returning({ id: projects.id });
      if (!inserted[0]) {
        tracker.warn(`proyecto ${row.id_proyecto}: la inserción no devolvió identificador`);
        tracker.skipped += 1;
        continue;
      }
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());

  await migrateProjectTeams(context);
  await migrateProjectTeamMembers(context);
  await migrateParticipationHistory(context);
  await migrateObservations(context, userIds);
}

interface LegacyProjectTeam {
  id: number;
  id_equipo: number;
  id_proyecto: number;
  id_lider_usuario: number | null;
  horas_asignadas: number | null;
}

async function migrateProjectTeams(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('equipos de proyecto');

  const rows = (await context.legacyReader.getRows<LegacyProjectTeam>('equipo_proyecto')).sort((a, b) => a.id - b.id);
  tracker.read = rows.length;

  const teamIds = await loadLegacyIdMap(context, teams);
  const projectIds = await loadLegacyIdMap(context, projects);
  const userIds = await loadLegacyIdMap(context, users);

  for (const row of rows) {
    const teamId = teamIds.get(row.id_equipo);
    const projectId = projectIds.get(row.id_proyecto);
    if (!teamId || !projectId) {
      tracker.warn(`equipo_proyecto ${row.id}: equipo o proyecto no resoluble`);
      tracker.skipped += 1;
      continue;
    }

    const values = {
      teamId,
      projectId,
      leaderUserId: row.id_lider_usuario ? (userIds.get(row.id_lider_usuario) ?? null) : null,
      assignedHours: row.horas_asignadas !== null ? String(row.horas_asignadas) : null,
    };

    const existing = await context.target
      .select({ id: projectTeams.id })
      .from(projectTeams)
      .where(eq(projectTeams.legacyId, row.id))
      .limit(1);

    if (existing[0]) {
      await context.target.update(projectTeams).set({ ...values, updatedAt: new Date() }).where(eq(projectTeams.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(projectTeams).values({ legacyId: row.id, ...values });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

interface LegacyProjectMember {
  id: number;
  id_proyecto: number;
  id_equipo: number;
  id_miembro: number;
  actividad: string | null;
  hh_asignadas: string;
  hh_consumidas: string;
}

async function migrateProjectTeamMembers(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('miembros asignados a proyecto');

  const rows = (await context.legacyReader.getRows<LegacyProjectMember>('proyecto_colaborador')).sort((a, b) => a.id - b.id);
  tracker.read = rows.length;

  const teamIds = await loadLegacyIdMap(context, teams);
  const projectIds = await loadLegacyIdMap(context, projects);
  const teamMemberIds = await loadLegacyIdMap(context, teamMembers);

  for (const row of rows) {
    const teamId = teamIds.get(row.id_equipo);
    const projectId = projectIds.get(row.id_proyecto);
    const teamMemberId = teamMemberIds.get(row.id_miembro);

    if (!teamId || !projectId || !teamMemberId) {
      tracker.warn(`proyecto_colaborador ${row.id}: referencia no resoluble (equipo/proyecto/miembro)`);
      tracker.skipped += 1;
      continue;
    }

    const values = {
      teamId,
      projectId,
      teamMemberId,
      activity: row.actividad?.trim() || null,
      assignedHours: row.hh_asignadas,
      consumedHours: row.hh_consumidas,
    };

    const existing = await context.target
      .select({ id: projectTeamMembers.id })
      .from(projectTeamMembers)
      .where(eq(projectTeamMembers.legacyId, row.id))
      .limit(1);

    if (existing[0]) {
      await context.target.update(projectTeamMembers).set({ ...values, updatedAt: new Date() }).where(eq(projectTeamMembers.id, existing[0].id));
      tracker.updated += 1;
    } else {
      await context.target.insert(projectTeamMembers).values({ legacyId: row.id, ...values });
      tracker.created += 1;
    }
  }

  context.report.add(tracker.toResult());
}

interface LegacyParticipation {
  id: string;
  id_proyecto: number;
  id_usuario: number | null;
  id_equipo: number | null;
  tipo_participacion: string;
  fecha_inicio: Date;
  fecha_fin: Date | null;
}

async function migrateParticipationHistory(context: EtlContext): Promise<void> {
  const tracker = new StepTracker('historial de participación');

  const rows = (await context.legacyReader.getRows<LegacyParticipation>('proyecto_participacion_historial')).sort(
    (a, b) => a.fecha_inicio.getTime() - b.fecha_inicio.getTime(),
  );
  tracker.read = rows.length;

  const teamIds = await loadLegacyIdMap(context, teams);
  const projectIds = await loadLegacyIdMap(context, projects);
  const userIds = await loadLegacyIdMap(context, users);

  // Es un histórico append-only sin identificador legado reutilizable como
  // clave de idempotencia estable entre ejecuciones del ETL; se trunca e
  // inserta de nuevo en cada corrida real, dentro de la misma transacción.
  await context.target.delete(projectParticipationHistory);

  const rowsToInsert = [];
  for (const row of rows) {
    const projectId = projectIds.get(row.id_proyecto);
    if (!projectId) {
      tracker.warn(`participación ${row.id}: proyecto ${row.id_proyecto} no resoluble`);
      tracker.skipped += 1;
      continue;
    }

    rowsToInsert.push({
      projectId,
      userId: row.id_usuario ? (userIds.get(row.id_usuario) ?? null) : null,
      teamId: row.id_equipo ? (teamIds.get(row.id_equipo) ?? null) : null,
      participationType: row.tipo_participacion === 'lider_pm' ? ('project_leader' as const) : ('team' as const),
      startedAt: row.fecha_inicio,
      endedAt: row.fecha_fin,
    });
  }

  if (rowsToInsert.length > 0) {
    await context.target.insert(projectParticipationHistory).values(rowsToInsert);
    tracker.created = rowsToInsert.length;
  }

  context.report.add(tracker.toResult());
}

interface LegacyObservation {
  id: string;
  id_proyecto: number;
  mensaje: string;
  actor_id_usuario: number;
  created_at: Date;
}

async function migrateObservations(
  context: EtlContext,
  userIds: Map<number, string>,
): Promise<void> {
  const tracker = new StepTracker('observaciones de proyecto');

  const rows = (await context.legacyReader.getRows<LegacyObservation>('proyecto_observacion')).sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  tracker.read = rows.length;

  const projectIds = await loadLegacyIdMap(context, projects);

  // Mismo criterio que el historial de participación: es una bitácora, no una
  // entidad con estado propio que actualizar; se re-siembra en cada corrida.
  await context.target.delete(projectObservations);

  const rowsToInsert = [];
  for (const row of rows) {
    const projectId = projectIds.get(row.id_proyecto);
    const authorUserId = userIds.get(row.actor_id_usuario);

    if (!projectId || !authorUserId) {
      tracker.warn(`observación ${row.id}: proyecto o autor no resoluble`);
      tracker.skipped += 1;
      continue;
    }

    rowsToInsert.push({
      projectId,
      message: row.mensaje,
      authorUserId,
      createdAt: row.created_at,
    });
  }

  if (rowsToInsert.length > 0) {
    await context.target.insert(projectObservations).values(rowsToInsert);
    tracker.created = rowsToInsert.length;
  }

  context.report.add(tracker.toResult());
}

async function loadLegacyIdMap(
  context: EtlContext,
  table: typeof clients | typeof clientContacts | typeof users | typeof teams | typeof projects | typeof teamMembers,
): Promise<Map<number, string>> {
  const rows = await context.target.select({ id: table.id, legacyId: table.legacyId }).from(table);
  const map = new Map<number, string>();
  for (const row of rows) if (row.legacyId !== null) map.set(row.legacyId, row.id);
  return map;
}

/** Mismo criterio que en la migración de clientes: dos saltos hasta el usuario real. */
async function loadCommercialManagerUserIds(context: EtlContext): Promise<Map<number, string>> {
  const legacyRows = await context.legacyReader.getRows<{ id_responsable_comercial: number; legacy_usuario_id: number | null }>(
    'responsable_comercial',
  );
  const userIds = await loadLegacyIdMap(context, users);

  const map = new Map<number, string>();
  for (const row of legacyRows) {
    if (!row.legacy_usuario_id) continue;
    const userId = userIds.get(row.legacy_usuario_id);
    if (userId) map.set(row.id_responsable_comercial, userId);
  }
  return map;
}
