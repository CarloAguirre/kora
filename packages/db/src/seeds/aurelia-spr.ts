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
 * Carga de la ficha de Leslie v2 (`AurelIA-SPR-proyecto-kora_v2.xlsx`, corte 21/10/2026) en el
 * proyecto REAL "AurelIA - SPR" (`legacy_id = 44`, viene del sync de la v1 — mismo criterio que
 * `demo-amicar-operaciones.ts`: se resuelve por `legacyId`, nunca por un uuid fijo).
 *
 * Dos destinos:
 * - `preview`: crea (o recrea) "AurelIA - SPR carga", un clon del proyecto real con todo cargado,
 *   para revisarlo antes de tocar el real. Lleva una COPIA de las horas del real (para ver el
 *   consumo de la fase) — se borran junto con el clon en cada corrida y con `cleanup`.
 * - `real`: aplica lo mismo sobre "AurelIA - SPR": fase, tramos, tareas, entrega, bitácora,
 *   Hito 0, retira el equipo IA (sin horas en SPR) e imputa a la fase las horas ya registradas.
 *   No crea ni borra horas. Reemplaza lo que haya sembrado una corrida anterior (v1: 4 fases).
 *
 * La v2 modela SPR como UNA fase ("SPR", 1.235 HH) que recorre las etapas del Panel de Control
 * (Levantamiento detallado 30 · Desarrollo 40 · Pruebas Gold Fields 25 · Marcha blanca 5). Kora no
 * tiene etapas con nombre, peso ni fechas dentro de una fase, así que se traspone así (decisión
 * del 22/10: una sola fase, como el Excel):
 * - Etapa actual de la fase: Desarrollo (el catálogo de fases no tiene "Pruebas"); la "Etapa de
 *   avance" del proyecto sí: `testing` (Pruebas).
 * - Cada tramo lleva su etapa al inicio del nombre; cada etapa (peso, fechas, HH, avance) y el
 *   historial semanal del Panel quedan como registros de bitácora.
 * - Las 3 entregas a Tania son UNA entrega con su historial (dos rechazos; la 3ra validada por la
 *   líder y pendiente de confirmación de GF, que es la tarea "Aprobación Gold Fields").
 * - Avance: para que Kora reproduzca el 85% real / 95% esperado del Panel, las tareas llevan HH
 *   estimadas como PESO (no como planificación): los 5 hitos de Pruebas, 61,75 HH c/u (5% del
 *   proyecto cada uno = el 25% de la etapa; 3 aprobados → 60%), y dos tareas "de etapa" para
 *   Levantamiento y Desarrollo con el peso que cuadra el total (la entrega pesa el promedio de las
 *   tareas — ver `project-progress.ts`). Marcha blanca (5%) queda sin ítems: no cuenta como
 *   esperado. Las tareas van SIN colaborador asignado (la ficha solo da el equipo): una tarea con
 *   asignado y HH genera filas de Forecast, aquí en semanas pasadas.
 * Equipos como están en Kora salvo IA; no se excluye ninguna hora.
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

/** Contactos del cliente — compartidos por ambos destinos (son datos reales de Gold Fields). */
const CONTACT_TANIA = 'a5b00000-0000-4000-8000-000000000001';
const CONTACT_ELISA = 'a5b00000-0000-4000-8000-000000000002';

/** IDs nuevos, fijos por destino — el clon y el real pueden convivir sin chocar. */
const ids = (target: AureliaSprTarget) => {
  const prefix = target === 'preview' ? 'a5b0c000' : 'a5b00000';
  const id = (n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    previewProject: id(10),
    moduleSpr: id(11),
    /** Fases de la carga v1 (4 etapas como fases) — se borran al re-sembrar el real. */
    legacyModules: [id(11), id(12), id(13), id(14)],
    deliveryTania: id(21),
    taskRediseno: id(31),
    taskCorreccionesTania: id(32),
    taskElisa: id(33),
    taskPruebasQa: id(34),
    taskAprobacionGf: id(35),
    taskEtapaLevantamiento: id(36),
    taskEtapaDesarrollo: id(37),
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
/** "Hoy" en Chile como `YYYY-MM-DD` — fecha del registro "Equipo IA retirado". */
const todayInChile = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Automatizar el ciclo mensual de consolidación de datos ambientales que hoy se arma manualmente para el reporte oficial que se firma y envía al SAC, con un flujo de firmas y validaciones auditable.';

/** Fase única de la v2. */
const PHASE = 'SPR';

export interface SeedAureliaSprResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
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

    // 0. Contactos del cliente — solo lo que trae la ficha (sin apellido, correo ni teléfono).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACT_TANIA, clientId, name: 'Tania' },
        { id: CONTACT_ELISA, clientId, name: 'Elisa', position: 'Aprobadora de diseño (SPR)' },
      ])
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
      await tx.delete(projectModules).where(inArray(projectModules.id, ID.legacyModules));
    }

    // 2. Datos generales + Hito 0 (manual: el módulo hereda la aprobación del proyecto madre).
    //    `actualProgress` es el caché de `ProjectProgressRecalculator` — 85% con este plan (ver cabecera).
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACT_TANIA,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-06-02'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 85,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única. Fechas de la ficha: fin 30/09 vencido por espera de feedback de GF.
    await tx.insert(projectModules).values({
      id: ID.moduleSpr,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'development',
      estimatedHours: '1235.00',
      estimatedStartDate: d('2026-06-02'),
      estimatedEndDate: d('2026-09-30'),
    });

    // 4. Tramos de ejecución T01–T12 (fechas reales del registro diario, ajustadas a los hitos), con
    //    su etapa al inicio del nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamUx, name: 'Levantamiento · Ideación de flujos, mockups y correcciones de diseño', start: '2026-06-22', end: '2026-07-14', users: [REAL.userAlexis, REAL.userEduardo] },
      { team: REAL.teamDev, name: 'Levantamiento · Kickoff, revisión de documentación y flujos, reunión de diseño con GF', start: '2026-06-02', end: '2026-07-14', users: [REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción del módulo SPR', start: '2026-07-07', end: '2026-08-17', users: [REAL.userNicolas, REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Desarrollo · Test plan y pruebas internas', start: '2026-07-28', end: '2026-08-17', users: [REAL.userConstanza] },
      { team: REAL.teamRpa, name: 'Desarrollo · Seguimiento y pruebas internas con perfiles', start: '2026-07-27', end: '2026-08-17', users: [REAL.userJoseAponte] },
      { team: REAL.teamDev, name: 'Pruebas · Rediseño por proceso manual y correcciones del feedback de GF (01/09)', start: '2026-08-18', end: '2026-09-22', users: [REAL.userNicolas, REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Pruebas · Test de correos, pruebas de carga y estrés (JMeter) y test plan de cambios', start: '2026-08-18', end: '2026-09-21', users: [REAL.userConstanza] },
      { team: REAL.teamRpa, name: 'Pruebas · Seguimiento y pruebas con usuarios', start: '2026-08-18', end: '2026-09-28', users: [REAL.userJoseAponte] },
      { team: REAL.teamUx, name: 'Pruebas · Correcciones de UI, manual de usuario y video de flujo', start: '2026-09-04', end: '2026-10-20', users: [REAL.userAlexis] },
      { team: REAL.teamDev, name: "Pruebas · Correcciones del correo 'Revisión módulo SPR' y restauración histórica (01/26–08/26)", start: '2026-10-02', end: '2026-10-08', users: [REAL.userCarlo, REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Pruebas · Revisión de correcciones según correo de GF', start: '2026-10-08', end: '2026-10-09', users: [REAL.userConstanza] },
      { team: REAL.teamRpa, name: 'Pruebas · Seguimiento de la 3ra entrega', start: '2026-10-02', end: '2026-10-05', users: [REAL.userJoseAponte] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.moduleSpr, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entrega a Tania — las 3 entregas de la ficha (18/08 y 29/09 rechazadas, 09/10 validada por la
    //    líder y pendiente de confirmación de GF) son una misma entrega con su historial (abajo, en la bitácora).
    const TANIA = 'Desarrollo web a Tania para pruebas con usuarios';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryTania,
      moduleId: ID.moduleSpr,
      teamId: REAL.teamDev,
      name: TANIA,
      description:
        "1ra entrega 18/08 (cierra la etapa Desarrollo; GF pidió correcciones el 01/09). 2da entrega 29/09 (GF respondió el 02/10 con el correo 'Revisión módulo SPR'). 3ra entrega 09/10 con nuevas correcciones: validada por la líder, pendiente de confirmación de GF (tarea 'Aprobación Gold Fields').",
      assigneeUserId: REAL.userSolmary,
      estimatedDate: d('2026-10-09'),
      status: 'approved',
      createdAt: at('2026-07-07'),
      updatedAt: at('2026-10-09'),
    });

    // 6. Tareas — los hitos de la ficha que no son entregas, más una por etapa ya cerrada. Las HH son
    //    el PESO de cada una en el avance (ver cabecera), sin colaborador asignado: así no generan Forecast.
    //    Levantamiento + Desarrollo = 717,84 HH (repartidas 30:40) es lo que cuadra 85% real / 95% esperado
    //    junto con los 5 hitos de 61,75 HH y la entrega aprobada (que pesa el promedio de las 7 tareas).
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '307.65', start: '2026-06-02', date: '2026-07-14', doneOn: '2026-07-14' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '410.19', start: '2026-07-07', date: '2026-08-17', doneOn: '2026-08-17' },
      { id: ID.taskRediseno, team: REAL.teamDev, name: 'Rediseño por proceso manual (descarte de automatizaciones SAC y SAP)', scope: 'desarrollo', hours: '61.75', start: '2026-08-27', date: '2026-08-28', doneOn: '2026-08-28' },
      { id: ID.taskCorreccionesTania, team: REAL.teamDev, name: 'Correcciones solicitadas por Tania', scope: 'desarrollo', hours: '61.75', start: '2026-09-01', date: '2026-09-11', doneOn: '2026-09-11' },
      { id: ID.taskElisa, team: REAL.teamUx, name: 'Aprobación del diseño por Elisa (OK cliente)', scope: 'revision_cliente', hours: '61.75', start: '2026-08-21', date: '2026-09-15', doneOn: '2026-09-15' },
      { id: ID.taskPruebasQa, team: REAL.teamQa, name: 'Pruebas de usuario QA (OK QA)', scope: 'qa', hours: '61.75', start: '2026-09-22', date: '2026-09-30', doneOn: null },
      { id: ID.taskAprobacionGf, team: REAL.teamDev, name: 'Aprobación Gold Fields (OK cliente)', scope: 'revision_cliente', hours: '61.75', start: '2026-09-22', date: '2026-09-30', doneOn: null },
    ] as const;
    await tx.insert(projectModuleTasks).values(
      tasks.map((task) => ({
        id: task.id,
        moduleId: ID.moduleSpr,
        teamId: task.team,
        name: task.name,
        description: WEIGHT_NOTE,
        estimatedHours: task.hours,
        startDate: d(task.start),
        date: d(task.date),
        status: task.doneOn ? ('done' as const) : ('todo' as const),
        scope: task.scope,
        completedAt: task.doneOn ? at(task.doneOn, 5) : null,
        createdAt: at(task.start),
        updatedAt: at(task.doneOn ?? task.start, 5),
      })),
    );

    // 7. Bitácora: Hito 0, etapas del Panel, historial de la entrega y las tareas (mismos textos que
    //    la API), incidentes e historial semanal de avance.
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
    const inPhase = `en fase "${PHASE}"`;
    const inSpr = { moduleId: ID.moduleSpr };
    const onTania = { moduleId: ID.moduleSpr, deliveryId: ID.deliveryTania };

    // Historial semanal del Panel de Control AurelIA (hoja "Historial de avance").
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 40, 40, ''],
      ['2026-07-31', 40, 40, ''],
      ['2026-08-07', 50, 50, 'Kabeli comenzó la fase de pruebas con lo desarrollado en la web.'],
      ['2026-08-14', 73, 73, 'Se solicita a Tania una reunión de levantamiento de robots.'],
      ['2026-08-21', 73, 73, '18/08: entregado a Tania para iniciar pruebas con usuarios. Agendar reunión con Elisa para revisar diseño.'],
      ['2026-08-28', 73, 73, 'Rediseño de procesos manuales por descarte de automatizaciones.'],
      ['2026-09-04', 80, 75, 'Pendiente finalización de pruebas y feedback de Tania.'],
      ['2026-09-11', 80, 85, 'Correcciones solicitadas por Tania realizadas; finalizando pruebas para reentregar.'],
      ['2026-09-25', 95, 80, '15/09: Elisa aprobó el diseño.'],
      ['2026-10-02', 95, 85, '29/09: reentregado a Tania con correcciones para pruebas con usuarios.'],
      ['2026-10-09', 95, 85, '09/10: se entregan las nuevas correcciones a Tania.'],
      ['2026-10-16', 95, 85, 'En espera de nuevo feedback.'],
      ['2026-10-23', 95, 85, 'En espera de nuevo feedback (lámina SPR sin cambios desde el 16-10).'],
    ];

    const entries: Omit<Observation, 'id'>[] = [
      log('2026-06-02', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),
      log('2026-06-02', 1, REAL.userSolmary, 'Reunión de inicio del módulo SPR (módulo N° 3 de 8 de AurelIA) con Gold Fields.', { type: 'hito', title: 'Kickoff del módulo SPR', status: 'cumplido', ...inSpr }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-07-14', 30, REAL.userSolmary, 'Etapa Levantamiento · peso 30% · 02/06–14/07 · 114,5 HH reales · avance 100%. Kickoff 02/06, ideación y mockups UX (22/06–14/07), revisión de diseño con GF 01/07.', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inSpr }),
      log('2026-08-17', 30, REAL.userSolmary, 'Etapa Desarrollo · peso 40% · 07/07–17/08 · 350,15 HH reales · avance 100%. Construcción del módulo, test plan QA y pruebas internas de Kabeli sobre lo desarrollado en la web (desde 07/08). Termina con la 1ra entrega a Tania (18/08).', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inSpr }),
      log('2026-08-18', 30, REAL.userSolmary, 'Etapa Pruebas · peso 25% · 18/08–30/09 · 200,75 HH reales · avance real 60% (esperado 100%). Entregas a Tania 18/08, 29/09 y 09/10; feedback GF 01/09 y 02/10; Elisa aprobó el diseño 15/09. Detenida en 60% a la espera de feedback de GF.', { type: 'hito', title: 'Etapa "Pruebas Gold Fields" en curso', status: 'activo', ...inSpr }),
      log('2026-08-18', 31, REAL.userSolmary, "Etapa Marcha blanca · peso 5% (columna 'Aprobado' del Panel) · sin iniciar. Empieza con el OK cliente de GF; fechas por definir. Después viene Finalizado, con el OK cliente final.", { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inSpr }),

      // Entrega a Tania: dos rechazos de GF y la 3ra entrega pendiente.
      log('2026-07-07', 0, REAL.userSolmary, `Nueva entrega "${TANIA}" agregada ${inPhase}, estimada para ${fmt('2026-08-18')}.`, onTania),
      log('2026-08-18', 0, REAL.userSolmary, `Entrega "${TANIA}" marcada como terminada ${inPhase}, ${deadline('2026-08-18', '2026-08-18')}; queda pendiente de aprobación.`, onTania),
      log('2026-09-01', 0, REAL.userSolmary, `Entrega "${TANIA}" rechazada ${inPhase}: Feedback de GF sobre la 1ra entrega: pidió correcciones.`, onTania),
      log('2026-09-01', 1, REAL.userSolmary, `Entrega "${TANIA}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-08-18')} a ${fmt('2026-09-29')}.`, onTania),
      log('2026-09-01', 2, REAL.userSolmary, 'Gold Fields envió su feedback sobre la 1ra entrega (desarrollo web para pruebas con usuarios) con correcciones a realizar.', { type: 'hito', title: 'Feedback de GF sobre la 1ra entrega', status: 'cumplido', ...inSpr }),
      log('2026-09-29', 0, REAL.userSolmary, `Entrega "${TANIA}" marcada como terminada ${inPhase}, ${deadline('2026-09-29', '2026-09-29')}; queda pendiente de aprobación.`, onTania),
      log('2026-10-02', 0, REAL.userSolmary, `Entrega "${TANIA}" rechazada ${inPhase}: GF respondió con el correo 'Revisión módulo SPR' con casos a corregir.`, onTania),
      log('2026-10-02', 1, REAL.userSolmary, `Entrega "${TANIA}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-09-29')} a ${fmt('2026-10-09')}.`, onTania),
      log('2026-10-09', 0, REAL.userSolmary, `Entrega "${TANIA}" marcada como terminada ${inPhase}, ${deadline('2026-10-09', '2026-10-09')}; queda pendiente de aprobación.`, onTania),
      log('2026-10-09', 5, REAL.userSolmary, `Entrega "${TANIA}" aprobada ${inPhase}, ${deadline('2026-10-09', '2026-10-09')}.`, onTania),

      // Tareas: creación y, si se cumplió, aprobación directa de la líder (no tienen colaborador asignado).
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.moduleSpr, taskId: task.id };
        const created = log(task.start, 0, REAL.userSolmary, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, REAL.userSolmary, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Incidentes de la ficha — Kora no tiene severidad/origen/responsable: van en el texto.
      log('2026-08-27', 10, REAL.userSolmary, "Se descartan las automatizaciones (BoT SAC y Bot SAP) y se rediseñan los procesos como manuales. Resolución: hito 'Rediseño por proceso manual' (28/08).\nTipo: Cambio de alcance · Origen: Externo · Severidad: Alta · Responsable: Solmary Castro.", { type: 'incidente', title: 'INC-02 · Descarte de bots SAC y SAP', status: 'resuelto', ...inSpr }),
      log('2026-10-01', 10, REAL.userSolmary, "La tarea 'Aprobación Gold Fields' (OK cliente, objetivo 30/09) venció sin confirmarse. Atraso atribuible a la espera de feedback de GF (INC-01): el plazo corre, pero las horas y el avance están detenidos.\nTipo: Atraso en entrega · Origen: Externo · Severidad: Media · Responsable: Solmary Castro · Relacionado: INC-01.", { type: 'incidente', title: 'INC-03 · Atraso en la aprobación de GF', status: 'abierto', ...inSpr }),
      log('2026-10-09', 10, REAL.userSolmary, 'Se entregaron las nuevas correcciones a Tania (3ra entrega, 09/10). GF aún no envía nuevo feedback.\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Responsable: Solmary Castro.', { type: 'incidente', title: 'INC-01 · Espera de feedback de Gold Fields', status: 'abierto', ...inSpr }),

      // Historial semanal de avance.
      ...panels.map(([on, expected, actual, note]) => {
        const deviation = actual - expected;
        const deviationText = deviation === 0 ? 'sin desvío' : `desvío ${deviation > 0 ? '+' : ''}${deviation} pts`;
        return log(on, 20, REAL.userSolmary, `Panel de Control AurelIA: esperado ${expected}% · real ${actual}% (${deviationText}).${note ? ` ${note}` : ''}`, {
          type: 'observacion',
          title: `Avance SPR · Panel ${fmt(on)}`,
          status: null,
          ...inSpr,
        });
      }),
    ];
    if (target === 'real' && (await tx.select({ id: projectTeams.id }).from(projectTeams).where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, REAL.teamIa)))).length > 0) {
      await tx.delete(projectTeams).where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, REAL.teamIa)));
      const now = new Date();
      entries.push({ ...log(todayInChile(), 0, REAL.userClaudio, 'Equipo "IA" retirado del proyecto.'), createdAt: now, updatedAt: now });
    }
    await tx.insert(projectObservations).values(entries.map((entry, index) => ({ ...entry, id: ID.observation(index) })));

    // 8. Horas — todas a la fase única: el real imputa las que ya tiene; el clon lleva una copia.
    const realHours = await tx.select().from(hourEntries).where(eq(hourEntries.projectId, realProject.id));
    if (target === 'real') {
      await tx.update(hourEntries).set({ moduleId: ID.moduleSpr }).where(eq(hourEntries.projectId, projectId));
    } else if (realHours.length > 0) {
      await tx.insert(hourEntries).values(
        realHours.map(({ id: _id, legacyId: _legacyId, ...entry }) => ({ ...entry, projectId, moduleId: ID.moduleSpr })),
      );
    }

    return {
      projectId,
      projectName: target === 'preview' ? PREVIEW_NAME : realProject.name,
      hoursInPhase: realHours.reduce((sum, entry) => sum + Number(entry.hours), 0),
    };
  });
}

/** Borra el clon "AurelIA - SPR carga" — primero sus horas copiadas (el FK las dejaría huérfanas, sin proyecto). */
export async function deletePreview(db: Pick<Database, 'delete'>): Promise<void> {
  const previewId = ids('preview').previewProject;
  await db.delete(hourEntries).where(eq(hourEntries.projectId, previewId));
  await db.delete(projectObservations).where(eq(projectObservations.projectId, previewId));
  await db.delete(projects).where(eq(projects.id, previewId));
}
