import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { slugify } from '../lib/slug';
import {
  clientContacts,
  hourEntries,
  projectModuleDeliveries,
  projectModules,
  projectModuleSegmentMembers,
  projectModuleSegments,
  projectModuleTasks,
  projectObservations,
  projectPaymentMilestones,
  projects,
  projectTeamMembers,
  projectTeams,
  teamMembers,
} from '../schema';

/**
 * Carga de la ficha de Leslie (`AurelIA-SPR-proyecto-kora.xlsx`, corte 21/10/2026) en el proyecto
 * REAL "AurelIA - SPR" (`legacy_id = 44`, viene del sync de la v1 — mismo criterio que
 * `demo-amicar-operaciones.ts`: se resuelve por `legacyId`, nunca por un uuid fijo).
 *
 * Dos destinos:
 * - `preview`: crea (o recrea) "AurelIA - SPR carga", un clon del proyecto real con todo cargado,
 *   para revisarlo antes de tocar el real. Lleva una COPIA de las horas del real (para ver el
 *   consumo por fase) — se borran junto con el clon en cada corrida y con `cleanup`.
 * - `real`: aplica lo mismo sobre "AurelIA - SPR": fases, tramos, tareas, entregas, bitácora,
 *   Hito 0, retira el equipo IA (sin horas en SPR) e imputa a su fase las horas ya registradas.
 *   No crea ni borra horas.
 *
 * Decisiones (Leslie, 21/10): avance calculado por Kora con las HH estimadas de la ficha (no los
 * pesos del Panel); equipos como están en Kora salvo IA; no se excluye ninguna hora.
 *
 * Fuera de lo que Kora modela, la ficha se traspone así: hito rechazado → historial de la entrega
 * en la bitácora; "OK QA"/"OK cliente" → tareas de ámbito QA/Rev. Cliente; incidentes y pendientes
 * sin fecha → bitácora (incidente/compromiso). F3 queda en 60% con 3 de 5 ítems aprobados (tareas
 * sin HH: avance por cantidad — HH estimadas en tareas pasadas ensuciarían el Forecast).
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-spr <preview|real|cleanup>`.
 */

export type AureliaSprTarget = 'preview' | 'real';

const LEGACY_ID_SPR = 44;
const PREVIEW_NAME = 'AurelIA - SPR carga';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamIa: '7e96e0a9-86bb-44a9-96f2-46e3660e7ce4',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAlexis: 'cd1b5960-73d5-4160-b996-262224245c79', // UX-UI
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userConstanza: '993ba721-0f33-4eca-9967-7072c10a48b6', // QA
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userNicolas: 'f71af37d-8ad5-44f0-a1a7-03330fd3282f', // Desarrollo (desvinculado)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de SPR
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contacto del cliente — compartido por ambos destinos (es un dato real de Gold Fields). */
const CONTACT_TANIA = 'a5b00000-0000-4000-8000-000000000001';

/** IDs nuevos, fijos por destino — el clon y el real pueden convivir sin chocar. */
const ids = (target: AureliaSprTarget) => {
  const prefix = target === 'preview' ? 'a5b0c000' : 'a5b00000';
  const id = (n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    previewProject: id(10),
    moduleF1: id(11),
    moduleF2: id(12),
    moduleF3: id(13),
    moduleF4: id(14),
    deliveryDiseno: id(21),
    deliveryPruebasGf: id(22),
    taskTestPlan: id(31),
    taskManual: id(32),
    taskCorrecciones: id(33),
    taskRevisionQa: id(34),
    taskOkCliente: id(35),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Hora del registro en la bitácora: mediodía de Chile, con minutos para ordenar los del mismo día. */
const at = (iso: string, minute = 0) => new Date(`${iso}T15:${String(minute).padStart(2, '0')}:00.000Z`);
/** Mismo formato que `formatCommittedDate`/`deadlineNote` de la API. */
const fmt = (iso: string) => d(iso).toLocaleDateString('es-CL', { timeZone: 'UTC' });
const deadline = (committed: string, done: string) => {
  const late = Math.max(Math.round((Date.parse(done) - Date.parse(committed)) / 86_400_000), 0);
  const note = `fecha comprometida ${fmt(committed)}`;
  return late === 0 ? `a tiempo (${note})` : `con ${late} ${late === 1 ? 'día' : 'días'} de atraso (${note})`;
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Automatizar el ciclo mensual de consolidación de datos ambientales que hoy se arma manualmente para el reporte oficial que se firma y envía al SAC, con un flujo de firmas y validaciones auditable.';

/**
 * Fase de cada hora ya registrada — criterio de la hoja "Horas reales" de la ficha (fecha y
 * actividad del registro diario): octubre completo y el manual de usuario (desde 17/09) son
 * Pruebas GF; UX y la revisión de documentación de jun–jul son Levantamiento, igual que las horas
 * de Solmary hasta la propuesta definitiva (14/07); el resto es Desarrollo.
 */
function moduleKeyFor(userId: string, isoDate: string): 'moduleF1' | 'moduleF2' | 'moduleF3' {
  if (isoDate >= '2026-10-01') return 'moduleF3';
  if (userId === REAL.userAlexis) {
    if (isoDate <= '2026-07-31') return 'moduleF1';
    return isoDate >= '2026-09-17' ? 'moduleF3' : 'moduleF2';
  }
  if (userId === REAL.userAnaSoto || userId === REAL.userEduardo) return 'moduleF1';
  if (userId === REAL.userSolmary && isoDate <= '2026-07-14') return 'moduleF1';
  return 'moduleF2';
}

export interface SeedAureliaSprResult {
  projectId: string;
  projectName: string;
  hoursByPhase: Record<string, number>;
}

export async function seedAureliaSpr(db: Database, target: AureliaSprTarget): Promise<SeedAureliaSprResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID_SPR)).limit(1);
  if (!realProject) {
    throw new Error(
      `No se encontró el proyecto "AurelIA - SPR" (legacy_id=${LEGACY_ID_SPR}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`,
    );
  }
  if (!realProject.clientId) throw new Error('"AurelIA - SPR" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // Dentro de la transacción: el runner abre una sola conexión, y la transacción la ocupa.
    const resolveTeamMembership = async (teamId: string, userId: string): Promise<string> => {
      const [row] = await tx
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .orderBy(sql`${teamMembers.leftAt} is null desc`, desc(teamMembers.joinedAt))
        .limit(1);
      if (!row) throw new Error(`No se encontró la membresía de user=${userId} en team=${teamId} en esta base.`);
      return row.id;
    };

    // 0. Contacto del cliente — solo nombre: la ficha no trae apellido, cargo, correo ni teléfono.
    await tx
      .insert(clientContacts)
      .values({ id: CONTACT_TANIA, clientId, name: 'Tania' })
      .onConflictDoNothing({ target: clientContacts.id });

    // 1. Proyecto destino — el real, o un clon recién creado.
    let projectId = realProject.id;
    if (target === 'preview') {
      projectId = ID.previewProject;
      await deletePreview(tx);
      const { id: _id, legacyId: _legacyId, createdAt: _createdAt, updatedAt: _updatedAt, ...cloneable } = realProject;
      await tx.insert(projects).values({ ...cloneable, id: projectId, name: PREVIEW_NAME, slug: slugify(PREVIEW_NAME) });

      // Equipos (sin IA), colaboradores y tramos de pago, tal como están en el real.
      const [teamRows, memberRows, paymentRows] = await Promise.all([
        tx.select().from(projectTeams).where(eq(projectTeams.projectId, realProject.id)),
        tx.select().from(projectTeamMembers).where(eq(projectTeamMembers.projectId, realProject.id)),
        tx.select().from(projectPaymentMilestones).where(eq(projectPaymentMilestones.projectId, realProject.id)),
      ]);
      const keptTeams = teamRows.filter((row) => row.teamId !== REAL.teamIa);
      if (keptTeams.length > 0) {
        await tx.insert(projectTeams).values(
          keptTeams.map(({ id: _rowId, legacyId: _rowLegacyId, createdAt: _c, updatedAt: _u, ...row }) => ({ ...row, projectId })),
        );
      }
      if (memberRows.length > 0) {
        await tx.insert(projectTeamMembers).values(
          memberRows.map(({ id: _rowId, legacyId: _rowLegacyId, createdAt: _c, updatedAt: _u, ...row }) => ({ ...row, projectId })),
        );
      }
      if (paymentRows.length > 0) {
        await tx
          .insert(projectPaymentMilestones)
          .values(paymentRows.map(({ id: _rowId, createdAt: _c, updatedAt: _u, ...row }) => ({ ...row, projectId })));
      }
    } else {
      // Re-corrida: se reemplaza solo lo que siembra este archivo (ids fijos), nunca lo cargado a mano.
      await tx.delete(projectObservations).where(
        and(eq(projectObservations.projectId, projectId), sql`${projectObservations.id}::text like 'a5b00000-%'`),
      );
      await tx
        .delete(projectModules)
        .where(inArray(projectModules.id, [ID.moduleF1, ID.moduleF2, ID.moduleF3, ID.moduleF4]));
    }

    // 2. Datos generales + Hito 0 (manual: el módulo hereda la aprobación del proyecto madre).
    //    `actualProgress` es el caché de `ProjectProgressRecalculator` — 81% con este plan
    //    (F1 y F2 finalizadas, F3 en 60%, F4 sin iniciar; las fases pesan por sus HH estimadas).
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACT_TANIA,
        scopeNotes: OBJETIVO,
        hito0At: d('2026-06-02'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 81,
      })
      .where(eq(projects.id, projectId));

    // 3. Fases. HH estimadas de la ficha: F1 cerrada con su real; el saldo se reparte F2–F4 según
    //    los pesos del Panel (40/25/5). F4 sin fechas: se definen con el feedback de GF.
    await tx.insert(projectModules).values([
      { id: ID.moduleF1, projectId, name: 'Levantamiento detallado', initialStage: 'discovery', currentStage: 'closed', estimatedHours: '114.50', estimatedStartDate: d('2026-06-02'), estimatedEndDate: d('2026-07-14') },
      { id: ID.moduleF2, projectId, name: 'Desarrollo', initialStage: 'development', currentStage: 'closed', estimatedHours: '640.29', estimatedStartDate: d('2026-07-07'), estimatedEndDate: d('2026-09-17') },
      { id: ID.moduleF3, projectId, name: 'Pruebas Gold Fields', initialStage: 'development', currentStage: 'development', estimatedHours: '400.18', estimatedStartDate: d('2026-09-17'), estimatedEndDate: d('2026-09-30') },
      { id: ID.moduleF4, projectId, name: 'Marcha blanca', initialStage: 'pilot', currentStage: 'pilot', estimatedHours: '80.03' },
    ]);

    // 4. Tramos de ejecución T01–T10 (fechas reales del registro diario). Sin `dailyPercent`:
    //    son pasados, no deben generar Forecast. Los 3 tramos pendientes sin fecha van a la bitácora.
    const segments = [
      { module: ID.moduleF1, team: REAL.teamUx, name: 'Ideación de flujos, mockups y correcciones de diseño', start: '2026-06-22', end: '2026-07-14', users: [REAL.userAlexis, REAL.userEduardo] },
      { module: ID.moduleF1, team: REAL.teamDev, name: 'Kickoff, revisión de documentación y flujos, reunión de diseño con GF', start: '2026-06-02', end: '2026-07-14', users: [REAL.userAnaSoto, REAL.userSolmary] },
      { module: ID.moduleF2, team: REAL.teamDev, name: 'Construcción del módulo SPR', start: '2026-07-07', end: '2026-09-17', users: [REAL.userNicolas, REAL.userSolmary] },
      { module: ID.moduleF2, team: REAL.teamQa, name: 'Test plan, test de correos y pruebas de carga y estrés (JMeter)', start: '2026-07-27', end: '2026-09-21', users: [REAL.userConstanza] },
      { module: ID.moduleF2, team: REAL.teamRpa, name: 'Seguimiento y pruebas funcionales con perfiles', start: '2026-07-27', end: '2026-09-28', users: [REAL.userJoseAponte] },
      { module: ID.moduleF2, team: REAL.teamUx, name: 'Correcciones de UI del módulo', start: '2026-09-04', end: '2026-09-04', users: [REAL.userAlexis] },
      { module: ID.moduleF3, team: REAL.teamUx, name: 'Manual de usuario y video de explicación del flujo', start: '2026-09-17', end: '2026-10-20', users: [REAL.userAlexis] },
      { module: ID.moduleF3, team: REAL.teamDev, name: "Correcciones del correo 'Revisión módulo SPR' y restauración histórica (01/26–08/26)", start: '2026-10-02', end: '2026-10-08', users: [REAL.userCarlo, REAL.userSolmary] },
      { module: ID.moduleF3, team: REAL.teamQa, name: 'Revisión de correcciones según correo de GF', start: '2026-10-08', end: '2026-10-09', users: [REAL.userConstanza] },
      { module: ID.moduleF3, team: REAL.teamRpa, name: 'Seguimiento de pruebas GF', start: '2026-10-02', end: '2026-10-05', users: [REAL.userJoseAponte] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: segment.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entregas — los hitos rechazados quedan como historial de una misma entrega (abajo, en la bitácora).
    const DISENO = 'Propuesta de diseño (mockups)';
    const PRUEBAS_GF = 'Módulo SPR para pruebas GF + manual de usuario';
    await tx.insert(projectModuleDeliveries).values([
      {
        id: ID.deliveryDiseno,
        moduleId: ID.moduleF1,
        teamId: REAL.teamUx,
        name: DISENO,
        description: '1ra propuesta revisada con GF el 01/07 (con correcciones de flujos); propuesta definitiva el 14/07.',
        assigneeUserId: REAL.userAlexis,
        estimatedDate: d('2026-07-14'),
        status: 'approved',
        createdAt: at('2026-06-22'),
        updatedAt: at('2026-07-14', 5),
      },
      {
        id: ID.deliveryPruebasGf,
        moduleId: ID.moduleF3,
        teamId: REAL.teamDev,
        name: PRUEBAS_GF,
        description: "1ra entrega 22/09; GF respondió el 02/10 con el correo 'Revisión módulo SPR'. 2da entrega (correcciones + video de flujo) el 09/10, en espera de nuevo feedback de GF.",
        assigneeUserId: REAL.userSolmary,
        estimatedDate: d('2026-10-09'),
        status: 'delivered',
        createdAt: at('2026-09-17'),
        updatedAt: at('2026-10-09'),
      },
    ]);

    // 6. Tareas — los hitos OK QA / OK cliente y el trabajo de F3. Sin HH estimadas (ver cabecera).
    const tasks = [
      { id: ID.taskTestPlan, module: ID.moduleF2, phase: 'Desarrollo', team: REAL.teamQa, user: REAL.userConstanza, userName: 'Constanza Mardones', name: 'Test plan SPR ejecutado (OK QA)', scope: 'qa', start: '2026-07-27', date: '2026-09-21', doneOn: '2026-09-21' },
      { id: ID.taskManual, module: ID.moduleF3, phase: 'Pruebas Gold Fields', team: REAL.teamUx, user: REAL.userAlexis, userName: 'Alexis Camilo Torres Fernández', name: 'Manual de usuario y video de explicación del flujo', scope: 'diseno', start: '2026-09-17', date: '2026-10-20', doneOn: '2026-10-20' },
      { id: ID.taskCorrecciones, module: ID.moduleF3, phase: 'Pruebas Gold Fields', team: REAL.teamDev, user: REAL.userCarlo, userName: 'Carlo Aguirre', name: 'Correcciones de observaciones GF y restauración histórica', scope: 'desarrollo', start: '2026-10-02', date: '2026-10-08', doneOn: '2026-10-08' },
      { id: ID.taskRevisionQa, module: ID.moduleF3, phase: 'Pruebas Gold Fields', team: REAL.teamQa, user: REAL.userConstanza, userName: 'Constanza Mardones', name: 'Revisión QA de las correcciones', scope: 'qa', start: '2026-10-08', date: '2026-10-09', doneOn: '2026-10-09' },
      { id: ID.taskOkCliente, module: ID.moduleF3, phase: 'Pruebas Gold Fields', team: REAL.teamDev, user: REAL.userSolmary, userName: 'Solmary Castro', name: 'Aprobación de Gold Fields (OK cliente)', scope: 'revision_cliente', start: '2026-09-22', date: '2026-09-30', doneOn: null },
    ] as const;
    await tx.insert(projectModuleTasks).values(
      tasks.map((task) => ({
        id: task.id,
        moduleId: task.module,
        teamId: task.team,
        assigneeUserId: task.user,
        name: task.name,
        startDate: d(task.start),
        date: d(task.date),
        status: task.doneOn ? ('done' as const) : ('todo' as const),
        scope: task.scope,
        completedAt: task.doneOn ? at(task.doneOn, 5) : null,
        createdAt: at(task.start),
        updatedAt: at(task.doneOn ?? task.start, 5),
      })),
    );

    // 7. Bitácora: Hito 0, historial de entregas y tareas (mismos textos que la API), hitos,
    //    incidentes y compromisos pendientes.
    type Observation = typeof projectObservations.$inferInsert;
    const log = (
      on: string,
      minute: number,
      authorUserId: string,
      message: string,
      extra: Partial<Observation> = {},
    ): Omit<Observation, 'id'> => ({
      projectId,
      type: 'cambio_proyecto',
      message,
      date: d(on),
      authorUserId,
      createdAt: at(on, minute),
      updatedAt: at(on, minute),
      ...extra,
    });
    const inF1 = 'en fase "Levantamiento detallado"';
    const inF3 = 'en fase "Pruebas Gold Fields"';

    const entries: Omit<Observation, 'id'>[] = [
      log('2026-06-02', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),
      log('2026-06-02', 1, REAL.userSolmary, 'Reunión de inicio del módulo SPR (módulo N° 3 de 8 de AurelIA) con Gold Fields.', { type: 'hito', title: 'Kickoff del módulo SPR', status: 'cumplido', moduleId: ID.moduleF1 }),

      // Entrega "Propuesta de diseño": 1ra versión rechazada en la revisión con GF, definitiva aprobada.
      log('2026-06-22', 0, REAL.userSolmary, `Nueva entrega "${DISENO}" agregada ${inF1}, estimada para ${fmt('2026-07-01')}.`, { moduleId: ID.moduleF1, deliveryId: ID.deliveryDiseno }),
      log('2026-07-01', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inF1}, ${deadline('2026-07-01', '2026-07-01')}; queda pendiente de aprobación.`, { moduleId: ID.moduleF1, deliveryId: ID.deliveryDiseno }),
      log('2026-07-01', 1, REAL.userSolmary, `Entrega "${DISENO}" rechazada ${inF1}: En la revisión de diseño con GF se pidieron correcciones de flujos (06–08/07).`, { moduleId: ID.moduleF1, deliveryId: ID.deliveryDiseno }),
      log('2026-07-01', 2, REAL.userSolmary, `Entrega "${DISENO}" ${inF1}: fecha estimada cambiada de ${fmt('2026-07-01')} a ${fmt('2026-07-14')}.`, { moduleId: ID.moduleF1, deliveryId: ID.deliveryDiseno }),
      log('2026-07-14', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inF1}, ${deadline('2026-07-14', '2026-07-14')}; queda pendiente de aprobación.`, { moduleId: ID.moduleF1, deliveryId: ID.deliveryDiseno }),
      log('2026-07-14', 5, REAL.userSolmary, `Entrega "${DISENO}" aprobada ${inF1}, ${deadline('2026-07-14', '2026-07-14')}.`, { moduleId: ID.moduleF1, deliveryId: ID.deliveryDiseno }),

      // Entrega "Módulo SPR para pruebas GF": rechazada por el correo de revisión, reenviada con correcciones.
      log('2026-09-17', 0, REAL.userSolmary, `Nueva entrega "${PRUEBAS_GF}" agregada ${inF3}, estimada para ${fmt('2026-09-22')}.`, { moduleId: ID.moduleF3, deliveryId: ID.deliveryPruebasGf }),
      log('2026-09-22', 0, REAL.userSolmary, `Entrega "${PRUEBAS_GF}" marcada como terminada ${inF3}, ${deadline('2026-09-22', '2026-09-22')}; queda pendiente de aprobación.`, { moduleId: ID.moduleF3, deliveryId: ID.deliveryPruebasGf }),
      log('2026-10-02', 0, REAL.userSolmary, `Entrega "${PRUEBAS_GF}" rechazada ${inF3}: GF respondió con el correo 'Revisión módulo SPR' con casos a corregir.`, { moduleId: ID.moduleF3, deliveryId: ID.deliveryPruebasGf }),
      log('2026-10-02', 1, REAL.userSolmary, `Entrega "${PRUEBAS_GF}" ${inF3}: fecha estimada cambiada de ${fmt('2026-09-22')} a ${fmt('2026-10-09')}.`, { moduleId: ID.moduleF3, deliveryId: ID.deliveryPruebasGf }),
      log('2026-10-09', 0, REAL.userSolmary, `Entrega "${PRUEBAS_GF}" marcada como terminada ${inF3}, ${deadline('2026-10-09', '2026-10-09')}; queda pendiente de aprobación.`, { moduleId: ID.moduleF3, deliveryId: ID.deliveryPruebasGf }),

      // Tareas: creación, completada y aprobada.
      ...tasks.flatMap((task) => {
        const inPhase = `en fase "${task.phase}"`;
        const label = `Tarea "${task.name}"`;
        const created = log(task.start, 0, REAL.userSolmary, `Nueva tarea "${task.name}" creada ${inPhase}, asignada a ${task.userName}, con fecha límite ${fmt(task.date)}.`, { moduleId: task.module, taskId: task.id });
        if (!task.doneOn) return [created];
        return [
          created,
          log(task.doneOn, 3, task.user, `${label} marcada como completada ${inPhase}, pendiente de aprobación, ${deadline(task.date, task.doneOn)}.`, { moduleId: task.module, taskId: task.id }),
          log(task.doneOn, 5, REAL.userSolmary, `${label} aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, { moduleId: task.module, taskId: task.id }),
        ];
      }),

      // Incidentes de la ficha — Kora no tiene severidad/origen/responsable: van en el texto.
      log('2026-10-09', 10, REAL.userSolmary, "Se entregaron las correcciones del correo 'Revisión módulo SPR' (05–09/10). GF aún no envía nuevo feedback.\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Responsable: Solmary Castro.", { type: 'incidente', title: 'INC-01 · Espera de feedback de Gold Fields', status: 'abierto', moduleId: ID.moduleF3 }),
      log('2026-10-16', 10, REAL.userSolmary, 'Automatizaciones pendientes: BoT SAC y Bot SAP. Se solicitó a Tania una reunión de levantamiento de robots. Desde el 27/08 se trabaja una solución de flujos sin integración con sistemas externos.\nTipo: Cambio de alcance · Origen: Externo · Severidad: Alta · Responsable: Solmary Castro.', { type: 'incidente', title: 'INC-02 · Bots SAC y SAP pendientes', status: 'abierto', moduleId: ID.moduleF3 }),
      log('2026-10-01', 10, REAL.userSolmary, 'La aprobación de Gold Fields (OK cliente, objetivo 30/09) venció sin confirmarse. Atraso atribuible a la espera de feedback de GF (INC-01): el plazo corre, pero las horas y el avance están detenidos.\nTipo: Atraso en entrega · Origen: Externo · Severidad: Media · Responsable: Solmary Castro · Relacionado: INC-01.', { type: 'incidente', title: 'INC-03 · Atraso en la aprobación de GF', status: 'abierto', moduleId: ID.moduleF3 }),

      // Pendientes sin fecha — pasan a tramos/tareas cuando se definan.
      log('2026-10-09', 11, REAL.userSolmary, 'Ajustes del nuevo feedback de GF (equipo Desarrollo). Fechas por definir: dependen de que GF envíe su feedback.', { type: 'compromiso', title: 'Ajustes del nuevo feedback de GF', status: 'pendiente', moduleId: ID.moduleF3 }),
      log('2026-10-16', 11, REAL.userSolmary, 'Bots SAC y SAP (equipo RPA): requiere reunión de levantamiento de robots con Tania. Fase y fechas por definir.', { type: 'compromiso', title: 'Reunión de levantamiento de bots SAC y SAP con Tania', status: 'pendiente' }),
    ];
    if (target === 'real' && (await tx.select({ id: projectTeams.id }).from(projectTeams).where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, REAL.teamIa)))).length > 0) {
      await tx.delete(projectTeams).where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, REAL.teamIa)));
      const today = new Date().toISOString().slice(0, 10);
      entries.push(log(today, 0, REAL.userClaudio, 'Equipo "IA" retirado del proyecto.'));
    }
    await tx.insert(projectObservations).values(entries.map((entry, index) => ({ ...entry, id: ID.observation(index) })));

    // 8. Horas por fase — el real imputa las que ya tiene; el clon lleva una copia imputada.
    const realHours = await tx.select().from(hourEntries).where(eq(hourEntries.projectId, realProject.id));
    const moduleOf = (entry: { userId: string; date: Date }) => ID[moduleKeyFor(entry.userId, entry.date.toISOString().slice(0, 10))];
    if (target === 'real') {
      for (const moduleKey of ['moduleF1', 'moduleF2', 'moduleF3'] as const) {
        const entryIds = realHours.filter((entry) => moduleOf(entry) === ID[moduleKey]).map((entry) => entry.id);
        if (entryIds.length > 0) await tx.update(hourEntries).set({ moduleId: ID[moduleKey] }).where(inArray(hourEntries.id, entryIds));
      }
    } else if (realHours.length > 0) {
      await tx.insert(hourEntries).values(
        realHours.map(({ id: _id, legacyId: _legacyId, ...entry }) => ({ ...entry, projectId, moduleId: moduleOf(entry) })),
      );
    }

    const names: Record<string, string> = { [ID.moduleF1]: 'F1', [ID.moduleF2]: 'F2', [ID.moduleF3]: 'F3' };
    const hoursByPhase: Record<string, number> = {};
    for (const entry of realHours) {
      const phase = names[moduleOf(entry)]!;
      hoursByPhase[phase] = (hoursByPhase[phase] ?? 0) + Number(entry.hours);
    }

    return { projectId, projectName: target === 'preview' ? PREVIEW_NAME : realProject.name, hoursByPhase };
  });
}

/** Borra el clon "AurelIA - SPR carga" — primero sus horas copiadas (el FK las dejaría huérfanas, sin proyecto). */
export async function deletePreview(db: Pick<Database, 'delete'>): Promise<void> {
  const previewId = ids('preview').previewProject;
  await db.delete(hourEntries).where(eq(hourEntries.projectId, previewId));
  await db.delete(projectObservations).where(eq(projectObservations.projectId, previewId));
  await db.delete(projects).where(eq(projects.id, previewId));
}
