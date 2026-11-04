import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import {
  clientContacts,
  hourEntries,
  projectModuleDeliveries,
  projectModules,
  projectModuleSegmentMembers,
  projectModuleSegments,
  projectModuleTasks,
  projectObservations,
  projects,
} from '../schema';
import {
  at,
  createPreviewProject,
  d,
  deadline,
  deletePreviewProject,
  fixedId,
  fmt,
  observationLogger,
  panelObservation,
  resolveTeamMembership,
  type FichaTarget,
  type ObservationInsert,
} from './lib/ficha';

/**
 * Carga de la ficha de Leslie `AurelIA-Monitoreo-de-agua-proyecto-kora.xlsx` (corte 23/10/2026) en el
 * proyecto REAL "AurelIA - Monitoreo de agua" (`legacy_id = 205`, del sync de la v1 — se resuelve por
 * `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Monitoreo de agua carga" con una COPIA de las horas; `real` aplica sobre el proyecto real
 * (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Monitoreo de agua", 452 HH, 29/07–06/11) que recorre las etapas del Panel de Control
 * (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`); etapa de avance del proyecto: `testing`
 * (la ficha recomienda cambiar "En desarrollo" por Pruebas desde el paso a QA del 20/10). Cada tramo
 * lleva su etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del Panel
 * quedan en la bitácora.
 *
 * Avance: 70% real / 35% esperado — real de la Presentación AurelIA 10-26 (Levantamiento y Desarrollo
 * al 100%), esperado del Panel 23/10 (único dato; la ficha pide confirmarlo con Solmary). Ítems con peso
 * (HH estimadas = peso, sin colaborador asignado → no generan Forecast): la tarea "de etapa" de
 * Levantamiento, la propuesta de diseño (2 rondas con observaciones, aprobada el 28/09; pesa el
 * promedio de las tareas — ver `project-progress.ts`), Desarrollo partido en el avance comprometido al
 * Panel del 16/10 (5 de 40) y su término (35 de 40), y Pruebas G.F. y Marcha blanca, pendientes. El
 * término de Desarrollo, Pruebas G.F. y Marcha blanca vencen el 06/11 (fecha de fin): hoy 70/35; si
 * pasa el 06/11 sin aprobación de GF, Kora muestra el atraso (esperado 100%).
 *
 * Equipos como están en Kora (Desarrollo, UX-UI, QA y PMO; RPA e IA ya retirados): las 2 HH de José
 * Aponte (RPA) quedan en el tramo de levantamiento de Desarrollo. Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-monitoreo-de-agua <preview|real|cleanup>`.
 */

const LEGACY_ID = 205;
const PREVIEW_NAME = 'AurelIA - Monitoreo de agua carga';
const PHASE = 'Monitoreo de agua';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAlexis: 'cd1b5960-73d5-4160-b996-262224245c79', // UX-UI
  userConstanza: '993ba721-0f33-4eca-9967-7072c10a48b6', // QA
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userGonzalo: 'cfa457d1-bd5c-4556-8455-ab272d0d79f3', // Desarrollo
  userNicolasHidalgo: '7eb83a42-0877-44ae-8906-b990ab9f8df4', // Desarrollo
  userNicolasParra: 'f71af37d-8ad5-44f0-a1a7-03330fd3282f', // Desarrollo (desvinculado)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Monitoreo de agua
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Contrapartes: Catalina y Marjorie. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b8c000' : 'a5b80000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryDiseno: id(21),
    taskEtapaLevantamiento: id(31),
    taskDesarrolloComprometido: id(32),
    taskDesarrolloTermino: id(33),
    taskPruebasGf: id(34),
    taskMarchaBlanca: id(35),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Reemplazar el proceso actual de monitoreo de aguas subterráneas —hoy disperso entre PDF de laboratorio, planillas Excel externas y una plataforma cuyo contrato vence este año— por un flujo unificado dentro de AurelIA: captura de datos de campaña (in-situ y laboratorio), visualización histórica por sector/pozo y alertas automáticas de superación de umbral y de dato anómalo.\n\nTerceros involucrados: SERPRAM (plataforma actual) y Wolke (empresa que opera los pozos).';

export interface SeedAureliaMonitoreoDeAguaResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaMonitoreoDeAgua(db: Database, target: FichaTarget): Promise<SeedAureliaMonitoreoDeAguaResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Monitoreo de agua" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Monitoreo de agua" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Contraparte GF' },
        { id: CONTACTS.marjorie, clientId, name: 'Marjorie', position: 'Contraparte GF' },
        { id: CONTACTS.elisa, clientId, name: 'Elisa', position: 'Aprobadora de diseño (SPR)' },
      ])
      .onConflictDoNothing({ target: clientContacts.id });

    // 1. Proyecto destino — el real, o un clon recién creado.
    let projectId = realProject.id;
    if (target === 'preview') {
      projectId = ID.previewProject;
      await createPreviewProject(tx, realProject, projectId, PREVIEW_NAME);
    } else {
      // Re-corrida: se reemplaza solo lo que siembra este archivo (ids fijos), nunca lo cargado a mano.
      await tx
        .delete(projectObservations)
        .where(and(eq(projectObservations.projectId, projectId), sql`${projectObservations.id}::text like ${`${ID.prefix}-%`}`));
      await tx.delete(projectModules).where(inArray(projectModules.id, [ID.module]));
    }

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 70%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-07-29'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 70,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas desde el paso a QA del 20/10. Fin 06/11.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: '452.00',
      estimatedStartDate: d('2026-07-29'),
      estimatedEndDate: d('2026-11-06'),
    });

    // 4. Tramos T01–T11 (primer y último día con horas del equipo en la etapa), con su etapa al inicio
    //    del nombre; T02 (RPA, retirado del proyecto) va dentro de T01. Sin `dailyPercent`: son pasados,
    //    no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Levantamiento de requisitos con GF y SERPRAM, revisión de propuesta, reunión con Wolke y seguimiento (incluye levantamiento y reunión SERPRAM de José Aponte, RPA, 12–13/08)', start: '2026-07-29', end: '2026-09-28', users: [REAL.userNicolasHidalgo, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Levantamiento · Levantamiento, análisis, investigación e ideación del módulo', start: '2026-08-12', end: '2026-08-28', users: [REAL.userAlexis, REAL.userEduardo] },
      { team: REAL.teamUx, name: 'Levantamiento · Diseño de flujos y del módulo, últimos ajustes', start: '2026-08-31', end: '2026-09-09', users: [REAL.userAlexis] },
      { team: REAL.teamUx, name: 'Levantamiento · Levantamiento y diseño del submódulo "Extracción efectiva" (Wolke)', start: '2026-09-14', end: '2026-09-15', users: [REAL.userAlexis] },
      { team: REAL.teamDev, name: 'Desarrollo · Inicio de desarrollo (Nicolás Parra)', start: '2026-09-29', end: '2026-09-30', users: [REAL.userNicolasParra] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción: dashboard, carga xlsx, vista avanzada (Piper, Perfiles CE), alertas, análisis, umbrales, perfilamiento, aprobación de cargas, API keys', start: '2026-10-09', end: '2026-10-20', users: [REAL.userGonzalo] },
      { team: REAL.teamDev, name: 'Desarrollo · Estimación, seguimiento y revisiones del módulo con el cliente', start: '2026-09-30', end: '2026-10-20', users: [REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Desarrollo · Test plan de Monitoreo de Agua', start: '2026-10-19', end: '2026-10-20', users: [REAL.userConstanza] },
      { team: REAL.teamUx, name: 'Desarrollo · Reunión con Dev para planear modificaciones al flujo', start: '2026-10-20', end: '2026-10-20', users: [REAL.userAlexis] },
      { team: REAL.teamDev, name: 'Pruebas · Modificaciones post revisión: vistas de Administración (puntos y parámetros), cards de carga, mejora de Piper', start: '2026-10-21', end: '2026-10-21', users: [REAL.userGonzalo, REAL.userSolmary] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Propuesta de diseño (H05, H06, H08): primera propuesta 03/09 y revisión con cambios 09/09, ambas
    //    con observaciones; término de la propuesta (diseño final revisado con Marjorie) 28/09 (Gantt).
    const DISENO = 'Propuesta de diseño del módulo';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryDiseno,
      moduleId: ID.module,
      teamId: REAL.teamUx,
      name: DISENO,
      description:
        'Primera propuesta presentada a GF el 03/09 (se solicitan umbrales de niveles y calidad de agua) y revisión con cambios el 09/09, ambas con observaciones; tras la reunión con Wolke se suma el submódulo "Extracción efectiva". Término de la propuesta de diseño el 28/09: diseño final revisado con Marjorie (Gantt Hitos 28 Sept, Panel 02/10).',
      assigneeUserId: REAL.userAlexis,
      estimatedDate: d('2026-09-28'),
      status: 'approved',
      createdAt: at('2026-08-25'),
      updatedAt: at('2026-09-28', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Con la propuesta de diseño pesando el promedio de las
    //    5 tareas (75,33), el total da 452: Levantamiento 60,27 + 75,33 = 135,6 (30%), Desarrollo
    //    22,6 + 158,2 (40%), Pruebas G.F. 113 (25%) y Marcha blanca 22,6 (5%). Aprobado = 70%; vencido a
    //    hoy (Levantamiento, propuesta y Desarrollo comprometido al 16/10) = 35%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '60.27', start: '2026-07-29', date: '2026-09-28', doneOn: '2026-09-28' },
      { id: ID.taskDesarrolloComprometido, team: null, name: 'Desarrollo: avance comprometido al Panel 16/10 (5 de 40%)', scope: 'desarrollo', hours: '22.60', start: '2026-09-29', date: '2026-10-16', doneOn: '2026-10-16' },
      { id: ID.taskDesarrolloTermino, team: null, name: 'Desarrollo: término y paso a QA (35 de 40%)', scope: 'desarrollo', hours: '158.20', start: '2026-09-29', date: '2026-11-06', doneOn: '2026-10-20' },
      { id: ID.taskPruebasGf, team: REAL.teamDev, name: 'Pruebas G.F.: pruebas y aprobación de Gold Fields (peso 25%)', scope: 'revision_cliente', hours: '113.00', start: '2026-10-21', date: '2026-11-06', doneOn: null },
      { id: ID.taskMarchaBlanca, team: REAL.teamDev, name: 'Marcha blanca (peso 5%)', scope: 'revision_cliente', hours: '22.60', start: '2026-10-21', date: '2026-11-06', doneOn: null },
    ] as const;
    await tx.insert(projectModuleTasks).values(
      tasks.map((task) => ({
        id: task.id,
        moduleId: ID.module,
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

    // 7. Bitácora: Hito 0, etapas, entrega y tareas (mismos textos que la API), hitos, incidentes e
    //    historial semanal del Panel (lámina Proyectos).
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDiseno = { moduleId: ID.module, deliveryId: ID.deliveryDiseno };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 0, 0, 'Aún como "Monitoreo de Agua y Aire", sin fechas.'],
      ['2026-07-31', 0, 2, 'Agua y Aire en una sola fila.'],
      ['2026-08-03', 0, 3, 'Agua y Aire en una sola fila.'],
      ['2026-08-14', 0, 8, 'Lámina del módulo (la tabla resumen decía 0/3%). Se decide separar Agua y Aire.'],
      ['2026-08-21', 0, 8, ''],
      ['2026-08-28', 10, 10, 'Primera versión como módulo propio.'],
      ['2026-09-04', 20, 20, 'Primera propuesta mostrada.'],
      ['2026-09-11', 25, 25, ''],
      ['2026-09-25', 25, 30, 'Reunión con Wolke, cambios de Marjorie.'],
      ['2026-10-02', 30, 35, 'Diseño final revisado con Marjorie.'],
      ['2026-10-09', 30, 36, 'Lámina del módulo (tabla resumen 30/35%). Comienza el desarrollo; fin 06/11.'],
      ['2026-10-16', 35, 45, ''],
      ['2026-10-23', 35, 70, 'Presentación AurelIA 10-26: 70% (fuente oficial del avance; el Panel del 23/10 repetía 35/45, lámina copiada del 16/10). Esperado del Panel 23/10, único dato disponible: confirmar con Solmary.'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-07-29', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-09-28', 30, S, 'Etapa Levantamiento · peso 30% · 29/07–28/09 · 85,75 HH reales · avance 100%. Desde el Hito 0 hasta el término de la propuesta de diseño (Gantt 28/09; diseño final revisado con Marjorie).', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-20', 30, S, 'Etapa Desarrollo · peso 40% · 29/09–20/10 · 58,25 HH reales · avance 100%. Desde el inicio de desarrollo (Nicolás Parra) hasta el "Paso a QA" del 20/10; la Presentación 23-10 deja la barra al final de Desarrollo (70%). El test plan de QA (19–20/10) queda en Desarrollo.', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-21', 30, S, 'Etapa Pruebas G.F. · peso 25% · desde el 21/10 · 0,75 HH reales · avance 0% (sin avance informado). Comienza tras el paso a QA.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso', status: 'activo', ...inModule }),
      log('2026-10-21', 31, S, 'Etapa Marcha blanca · peso 5% · sin iniciar (sin fecha en las fuentes).', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Propuesta de diseño (2 rondas con observaciones) y tareas.
      log('2026-08-25', 0, S, `Nueva entrega "${DISENO}" agregada ${inPhase}, estimada para ${fmt('2026-09-03')}.`, onDiseno),
      log('2026-09-03', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-09-03', '2026-09-03')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-09-03', 1, S, `Entrega "${DISENO}" rechazada ${inPhase}: primera propuesta de diseño presentada a GF con observaciones; se solicitan umbrales de niveles y calidad de agua.`, onDiseno),
      log('2026-09-03', 2, S, `Entrega "${DISENO}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-09-03')} a ${fmt('2026-09-09')}.`, onDiseno),
      log('2026-09-09', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-09-09', '2026-09-09')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-09-09', 1, S, `Entrega "${DISENO}" rechazada ${inPhase}: revisión con GF de la propuesta con cambios, con observaciones.`, onDiseno),
      log('2026-09-09', 2, S, `Entrega "${DISENO}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-09-09')} a ${fmt('2026-09-28')}.`, onDiseno),
      log('2026-09-28', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-09-28', '2026-09-28')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-09-28', 5, S, `Entrega "${DISENO}" aprobada ${inPhase}, ${deadline('2026-09-28', '2026-09-28')}.`, onDiseno),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-08-07', 40, S, 'Kabeli queda en trabajar una propuesta y esperar la reunión con SERPRAM (Panel 14/08).', { type: 'hito', title: 'Acuerdo: propuesta Kabeli y reunión con SERPRAM', status: 'cumplido', ...inModule }),
      log('2026-08-12', 40, S, 'Reunión con GF: muestran los archivos requeridos y aclaran dudas (Panel 14/08, registro de horas).', { type: 'hito', title: 'Reunión con GF: archivos requeridos y dudas', status: 'cumplido', ...inModule }),
      log('2026-08-13', 40, S, 'Reunión con SERPRAM: solicitud técnica para integraciones (registro de horas 13/08).', { type: 'hito', title: 'Reunión con SERPRAM (solicitud técnica para integraciones)', status: 'cumplido', ...inModule }),
      log('2026-08-14', 40, S, 'GF envía todos los archivos requeridos. Agua y Aire pasan a ser dos módulos con seguimiento separado (Panel 14/08).', { type: 'hito', title: 'GF envía los archivos · Agua y Aire se separan', status: 'cumplido', ...inModule }),
      log('2026-09-14', 40, S, 'Reunión con Wolke (operador de pozos): se levanta el nuevo submódulo "Extracción efectiva" (registro 14/09, Panel 25/09).', { type: 'hito', title: 'Reunión con Wolke · submódulo "Extracción efectiva"', status: 'cumplido', ...inModule }),
      log('2026-09-29', 40, S, 'Inicio de desarrollo (capacity de Nicolás Parra, Panel 09/10).', { type: 'hito', title: 'Inicio de desarrollo', status: 'cumplido', ...inModule }),
      log('2026-10-16', 40, S, 'Presentación del módulo desarrollado a Catalina (registro de horas de Gonzalo y Solmary).', { type: 'hito', title: 'Presentación del módulo desarrollado a Catalina', status: 'cumplido', ...inModule }),
      log('2026-10-19', 40, S, 'Reunión con Elisa para revisar el diseño / módulo (Panel 16/10, registro 19–20/10); se gestionan modificaciones el 20/10.', { type: 'hito', title: 'Reunión con Elisa (revisión del módulo)', status: 'cumplido', ...inModule }),
      log('2026-10-20', 40, S, 'Paso a QA · fin de Desarrollo (registro 20/10, Presentación 23-10: 70%).', { type: 'hito', title: 'Paso a QA · fin de Desarrollo', status: 'cumplido', ...inModule }),
      log('2026-10-21', 40, S, `Entrega estimada del módulo: ${fmt('2026-11-06')} (formulario Kora; en el Panel desde el 09/10). Quedan Pruebas G.F. (25%) y Marcha blanca (5%).`, { type: 'compromiso', title: 'Entrega estimada del módulo 06/11', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-21', 10, S, 'Desde el 21/08 el Panel repite "se debe agendar reunión con Elisa para revisar diseño". El desarrollo avanzó sin esa revisión; la reunión se realizó el 19/10.\nTipo: Espera de revisión de diseño · Origen: Externo · Cerrado: 19/10 (59 días).', { type: 'incidente', title: 'INC-01 · Espera de revisión de diseño por Elisa', status: 'resuelto', ...inModule }),
      log('2026-09-04', 10, S, 'Se solicitaron umbrales de niveles y calidad de agua (04/09); el 11/09 seguía en espera. El 20/10 el cliente respondió el documento de dudas pendientes.\nTipo: Espera de información del cliente · Origen: Externo · Cerrado: 20/10 (46 días; cierre supuesto por el registro de Gonzalo).', { type: 'incidente', title: 'INC-02 · Espera de umbrales de niveles y calidad de agua', status: 'resuelto', ...inModule }),
      log('2026-09-14', 10, S, 'Tras la reunión con Wolke se levanta un nuevo submódulo, "Extracción efectiva", que se incorpora al diseño.\nTipo: Ampliación de alcance · Origen: Externo · Cerrado: 15/09.', { type: 'incidente', title: 'INC-03 · Nuevo submódulo "Extracción efectiva"', status: 'resuelto', ...inModule }),
      log('2026-10-16', 10, S, 'Se envió correo con consultas a Wolke; no hay respuesta registrada (Panel 16/10).\nTipo: Espera de información de tercero · Origen: Externo.', { type: 'incidente', title: 'INC-04 · Consultas pendientes a Wolke', status: 'abierto', ...inModule }),

      // Historial semanal de avance.
      ...panels.map((panel) => panelObservation(log, S, PHASE, inModule, panel)),
    ];
    await tx.insert(projectObservations).values(entries.map((entry, index) => ({ ...entry, id: ID.observation(index) })));

    // 8. Horas — todas a la fase única: el real imputa las que ya tiene; el clon lleva una copia.
    const realHours = await tx.select().from(hourEntries).where(eq(hourEntries.projectId, realProject.id));
    if (target === 'real') {
      await tx.update(hourEntries).set({ moduleId: ID.module }).where(eq(hourEntries.projectId, projectId));
    } else if (realHours.length > 0) {
      await tx.insert(hourEntries).values(realHours.map(({ id: _id, legacyId: _legacyId, ...entry }) => ({ ...entry, projectId, moduleId: ID.module })));
    }

    return {
      projectId,
      projectName: target === 'preview' ? PREVIEW_NAME : realProject.name,
      hoursInPhase: realHours.reduce((sum, entry) => sum + Number(entry.hours), 0),
    };
  });
}

/** Borra el clon "AurelIA - Monitoreo de agua carga" con sus horas copiadas. */
export async function deleteMonitoreoDeAguaPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
