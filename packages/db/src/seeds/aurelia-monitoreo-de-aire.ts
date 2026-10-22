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
 * Carga de la ficha de Leslie `AurelIA-Monitoreo-de-aire-proyecto-kora.xlsx` (corte 23/10/2026) en el
 * proyecto REAL "AurelIA - monitoreo de aire" (`legacy_id = 224`, del sync de la v1 — se resuelve por
 * `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - monitoreo de aire carga" con una COPIA de las horas; `real` aplica sobre el proyecto real
 * (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Monitoreo de aire", 566 HH, 29/07–30/10) que recorre las etapas del Panel de Control
 * (30 · 40 · 25 · 5). Etapa de la fase y del proyecto: Desarrollo (en cierre, con QA interno desde el
 * 16/10; Pruebas = Pruebas G.F. con el cliente, sin iniciar). Cada tramo lleva su etapa al inicio del
 * nombre; etapas, hitos, incidentes y el historial semanal del Panel quedan en la bitácora.
 *
 * Avance: 70% real / 50% esperado, el de la Presentación AurelIA 10-26 (real) y el último Panel
 * publicado, 16/10 (esperado) — Levantamiento y Desarrollo al 100%. Ítems con peso (HH estimadas = peso,
 * sin colaborador asignado → no generan Forecast): la tarea "de etapa" de Levantamiento, la propuesta de
 * diseño del 09/09 (pesa el promedio de las tareas — ver `project-progress.ts`), Desarrollo partido en
 * el avance comprometido al Panel del 16/10 y su cierre, y Pruebas G.F. y Marcha blanca, pendientes.
 * El cierre de Desarrollo, Pruebas G.F. y Marcha blanca vencen el 30/10 (fecha de fin): hoy 70/50; si
 * pasa el 30/10 sin aprobación de GF, Kora muestra el atraso (esperado 100%).
 *
 * Equipos como están en Kora (Desarrollo, UX-UI, QA y PMO; RPA e IA ya retirados): el 0,25 HH de José
 * Aponte (RPA) queda en el tramo de gestión de Solmary. Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-monitoreo-de-aire <preview|real|cleanup>`.
 */

const LEGACY_ID = 224;
const PREVIEW_NAME = 'AurelIA - monitoreo de aire carga';
const PHASE = 'Monitoreo de aire';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userFrancisca: 'c3aaa952-108a-4510-b61c-1dec8e23f479', // QA
  userLiliana: 'b062dff8-f80f-4d8f-9993-98b5a90c47d4', // UX-UI
  userNicolas: '7eb83a42-0877-44ae-8906-b990ab9f8df4', // Desarrollo (Nicolás Javier Hidalgo Bucarey)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Monitoreo de aire
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Contrapartes: Catalina y Marjorie. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b7c000' : 'a5b70000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryDiseno: id(21),
    taskEtapaLevantamiento: id(31),
    taskDesarrolloComprometido: id(32),
    taskDesarrolloCierre: id(33),
    taskPruebasGf: id(34),
    taskMarchaBlanca: id(35),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Migrar el dashboard de calidad del aire desde la plataforma externa (SERPRAM/Air Advance) hacia AurelIA, para independizar a Gold Fields de terceros, resguardar el historial de mediciones y unificar la gestión ambiental en una sola herramienta. Es un módulo de solo lectura, alimentado por sensores en terreno.\n\nFuncionalidades: dashboard con mapa satelital interactivo de las 6 estaciones principales, con estado de alerta y datos brutos/validados en tiempo real; ficha de estación con resumen de valores y vista expandida con series temporales; capa de Red MPS (13 estaciones adicionales, frecuencia mensual); análisis histórico con filtros, series temporales, rosa de vientos y exportación; sistema de alertas (Prealerta / Alerta / Anomalía) con notificación automática por correo.\n\nProveedor externo de datos: SERPRAM / Air Advance.';

export interface SeedAureliaMonitoreoDeAireResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaMonitoreoDeAire(db: Database, target: FichaTarget): Promise<SeedAureliaMonitoreoDeAireResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - monitoreo de aire" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - monitoreo de aire" no tiene cliente asignado.');
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
        phase: 'development',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-07-29'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 70,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Desarrollo (en cierre). Fin 30/10.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'development',
      estimatedHours: '566.00',
      estimatedStartDate: d('2026-07-29'),
      estimatedEndDate: d('2026-10-30'),
    });

    // 4. Tramos T01–T08 (primer y último día con horas del equipo en la etapa), con su etapa al inicio
    //    del nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamUx, name: 'Levantamiento · Traspaso, levantamiento de información, análisis UX, prototipos y diseño en Figma (mapa interactivo, alertas, MPS, reportes); presentaciones a GF', start: '2026-08-21', end: '2026-09-10', users: [REAL.userLiliana, REAL.userEduardo] },
      { team: REAL.teamDev, name: 'Levantamiento · Evaluación de mapas y capa satelital, capas de contaminantes y viento, prueba de concepto en Leaflet', start: '2026-08-26', end: '2026-09-11', users: [REAL.userNicolas] },
      { team: REAL.teamDev, name: 'Levantamiento · Consultas al cliente, revisión de propuestas, solicitudes de documentación y gestión de datos entregados por GF (incluye seguimiento de José Aponte, RPA)', start: '2026-08-24', end: '2026-09-14', users: [REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Desarrollo · Revisión API/BD SERPRAM, estimación, modelo de datos, carga histórica, endpoints, dashboard, análisis, reportes, alertas, roles y capas de viento/contaminantes', start: '2026-09-16', end: '2026-10-14', users: [REAL.userNicolas] },
      { team: REAL.teamDev, name: 'Desarrollo · PR y merge a dev, tabla virtualizada, i18n, vista de carga de datos validados y MPS, cálculo ICA PM10, umbrales y correcciones de dashboard/alertas', start: '2026-10-15', end: '2026-10-21', users: [REAL.userNicolas] },
      { team: REAL.teamUx, name: 'Desarrollo · Consultas y ajustes de diseño del módulo', start: '2026-10-06', end: '2026-10-07', users: [REAL.userLiliana] },
      { team: REAL.teamQa, name: 'Desarrollo · Análisis funcional, diseño de casos de prueba e inicio de ejecución QA', start: '2026-10-16', end: '2026-10-20', users: [REAL.userFrancisca] },
      { team: REAL.teamDev, name: 'Desarrollo · Seguimiento, gestión con cliente y SERPRAM, revisión del módulo con el cliente', start: '2026-09-15', end: '2026-10-21', users: [REAL.userSolmary] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Propuesta de diseño (H03–H05): alto nivel 27/08, aterrizada 03/09 y término con cambios 09/09
    //    (Gantt). Validada por la líder; la aprobación formal de Elisa sigue pendiente (INC-02).
    const ENTREGA = 'Propuesta de diseño del módulo';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryDiseno,
      moduleId: ID.module,
      teamId: REAL.teamUx,
      name: ENTREGA,
      description:
        'Propuesta de alto nivel presentada a GF el 27/08, propuesta aterrizada y completa el 03/09 y término de la propuesta de diseño con cambios el 09/09 (Gantt Hitos 28 Sept, Panel 11/09). Queda pendiente lo de SERPRAM y la aprobación formal de Elisa.',
      assigneeUserId: REAL.userLiliana,
      estimatedDate: d('2026-09-09'),
      status: 'approved',
      createdAt: at('2026-08-21'),
      updatedAt: at('2026-09-09', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Con la propuesta de diseño pesando el promedio de las
    //    5 tareas (94,33), el total da 566: Levantamiento 75,47 + 94,33 = 169,8 (30%), Desarrollo
    //    113,2 + 113,2 (40%), Pruebas G.F. 141,5 (25%) y Marcha blanca 28,3 (5%). Aprobado = 70%; vencido
    //    a hoy (Levantamiento, propuesta y Desarrollo comprometido al 16/10) = 50%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '75.47', start: '2026-07-29', date: '2026-09-14', doneOn: '2026-09-14' },
      { id: ID.taskDesarrolloComprometido, team: null, name: 'Desarrollo: avance comprometido al Panel 16/10 (20 de 40%)', scope: 'desarrollo', hours: '113.20', start: '2026-09-15', date: '2026-10-16', doneOn: '2026-10-15' },
      { id: ID.taskDesarrolloCierre, team: null, name: 'Desarrollo: cierre y QA interno (20 de 40%)', scope: 'desarrollo', hours: '113.20', start: '2026-10-16', date: '2026-10-30', doneOn: '2026-10-21' },
      { id: ID.taskPruebasGf, team: REAL.teamDev, name: 'Pruebas G.F.: aprobación de Elisa y pruebas de Gold Fields (peso 25%)', scope: 'revision_cliente', hours: '141.50', start: '2026-10-22', date: '2026-10-30', doneOn: null },
      { id: ID.taskMarchaBlanca, team: REAL.teamDev, name: 'Marcha blanca (peso 5%)', scope: 'revision_cliente', hours: '28.30', start: '2026-10-22', date: '2026-10-30', doneOn: null },
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
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryDiseno };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 0, 0, 'Agua y Aire en una sola fila.'],
      ['2026-07-31', 0, 2, 'Agua y Aire en una sola fila.'],
      ['2026-08-03', 0, 3, 'Agua y Aire en una sola fila.'],
      ['2026-08-14', 0, 3, 'Agua y Aire en una sola fila.'],
      ['2026-08-21', 8, 8, 'Primera versión con Aire separado.'],
      ['2026-08-28', 10, 15, ''],
      ['2026-09-04', 20, 20, ''],
      ['2026-09-11', 25, 28, ''],
      ['2026-09-25', 25, 30, ''],
      ['2026-10-02', 30, 35, ''],
      ['2026-10-09', 40, 40, 'Fecha de término 30/10 aparece por primera vez.'],
      ['2026-10-16', 50, 55, ''],
      ['2026-10-23', 50, 70, 'Presentación AurelIA 10-26: 70% (fuente oficial del avance; el Panel del 23/10 repite la lámina del 16/10, 50% esperado / 55% real). Esperado arrastrado del Panel.'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-07-29', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-09-14', 30, S, 'Etapa Levantamiento · peso 30% · 29/07–14/09 · 128 HH reales · avance 100%. Término de propuesta de diseño 09/09 (Gantt); 10–14/09 ajustes de requerimientos y datos SERPRAM.', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-21', 30, S, 'Etapa Desarrollo · peso 40% · desde el 15/09 · 165 HH reales · avance 100% (en cierre: barra al 100% de Desarrollo en la lámina de Fases 23-10). PR y merge a dev 15/10; QA interno desde el 16/10.', { type: 'hito', title: 'Etapa "Desarrollo" al 100% (en cierre)', status: 'activo', ...inModule }),
      log('2026-10-21', 31, S, 'Etapa Pruebas G.F. · peso 25% · sin iniciar. Requiere aprobación de Elisa.', { type: 'compromiso', title: 'Etapa "Pruebas G.F." por iniciar', status: 'pendiente', ...inModule }),
      log('2026-10-21', 32, S, 'Etapa Marcha blanca · peso 5% · sin iniciar.', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Propuesta de diseño y tareas.
      log('2026-08-21', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-09-09')}.`, onDelivery),
      log('2026-09-09', 0, REAL.userLiliana, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-09-09', '2026-09-09')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-09-09', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-09-09', '2026-09-09')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-08-21', 40, S, 'Traspaso a UX e inicio del levantamiento detallado (registro de horas de Eduardo Aranda y Liliana Ochoa).', { type: 'hito', title: 'Traspaso a UX e inicio del levantamiento detallado', status: 'cumplido', ...inModule }),
      log('2026-08-24', 40, S, 'Reunión de consultas con Gold Fields: alcance y matriz de filtros (Panel 28/08).', { type: 'hito', title: 'Reunión de consultas con GF (alcance y matriz de filtros)', status: 'cumplido', ...inModule }),
      log('2026-08-27', 40, S, 'Propuesta de alto nivel presentada a Gold Fields; se solicitan documentación y definiciones (Panel 28/08).', { type: 'hito', title: 'Propuesta de alto nivel presentada a GF', status: 'cumplido', ...inModule }),
      log('2026-09-03', 40, S, 'Propuesta aterrizada y completa presentada a Gold Fields (Panel 04/09).', { type: 'hito', title: 'Propuesta aterrizada y completa presentada', status: 'cumplido', ...inModule }),
      log('2026-09-09', 40, S, 'Término de propuesta de diseño: propuesta completa con cambios (Gantt Hitos 28 Sept y Panel 11/09); queda pendiente lo de SERPRAM.', { type: 'hito', title: 'Término de propuesta de diseño', status: 'cumplido', ...inModule }),
      log('2026-09-15', 40, S, 'Inicio de desarrollo (Gantt Hitos 28 Sept).', { type: 'hito', title: 'Inicio de desarrollo', status: 'cumplido', ...inModule }),
      log('2026-09-25', 40, S, 'SERPRAM entrega la API (Panel 25/09).', { type: 'hito', title: 'SERPRAM entrega la API', status: 'cumplido', ...inModule }),
      log('2026-10-06', 40, S, 'Reunión con SERPRAM y el cliente (registro de horas de Solmary Castro).', { type: 'hito', title: 'Reunión con SERPRAM y cliente', status: 'cumplido', ...inModule }),
      log('2026-10-15', 40, S, 'PR y merge a entorno dev (registro de horas de Nicolás Hidalgo).', { type: 'hito', title: 'PR y merge a entorno dev', status: 'cumplido', ...inModule }),
      log('2026-10-16', 40, S, 'Revisión con el cliente del módulo desarrollado e inicio de QA interno (registro de horas de Solmary Castro y Francisca Ramirez).', { type: 'hito', title: 'Revisión del módulo con el cliente e inicio de QA interno', status: 'cumplido', ...inModule }),
      log('2026-10-20', 40, S, 'Casos de prueba QA terminados e inicio de ejecución (registro de horas de Francisca Ramirez).', { type: 'hito', title: 'Casos de prueba QA terminados e inicio de ejecución', status: 'activo', ...inModule }),
      log('2026-10-21', 40, S, `Fecha de fin comprometida: ${fmt('2026-10-30')} (formulario Kora y Panel). En riesgo: al corte quedan Pruebas G.F. (25%) y Marcha blanca (5%), condicionadas a la aprobación de Elisa y a las respuestas de SERPRAM.`, { type: 'compromiso', title: 'Fecha de fin comprometida 30/10 (en riesgo)', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-21', 10, S, '21/08–11/09: SERPRAM no entrega la API ni lo solicitado. 25/09 entrega la API. Desde el 09/10 faltan respuestas a consultas sobre calidad del aire; sigue pendiente en la Presentación 10-26.\nTipo: Dependencia de tercero · Origen: Externo.', { type: 'incidente', title: 'INC-01 · Dependencia de SERPRAM (API y consultas de calidad del aire)', status: 'abierto', ...inModule }),
      log('2026-08-21', 11, S, 'Desde el 21/08 el Panel pide agendar reunión con Elisa para revisar el diseño. La Presentación 10-26 indica que falta su aprobación del módulo; bloquea el paso a Pruebas G.F.\nTipo: Espera de feedback cliente · Origen: Externo.', { type: 'incidente', title: 'INC-02 · Aprobación de Elisa pendiente', status: 'abierto', ...inModule }),
      log('2026-10-16', 10, S, 'Se descarta la carga de datos vía SharePoint ("no va") y se agrega una vista para carga de datos validados y MPS.\nTipo: Cambio de alcance (menor) · Origen: Interno · Cerrado: 16/10.', { type: 'incidente', title: 'INC-03 · Carga de datos por SharePoint descartada', status: 'resuelto', ...inModule }),

      // Historial semanal de avance (más la lámina "Proyectos Goldfields 08-2026", sin esperado).
      log('2026-08-18', 20, S, 'Proyectos Goldfields 08-2026: real 10% · esperado por definir.', { type: 'observacion', title: `Avance ${PHASE} · Proyectos Goldfields ${fmt('2026-08-18')}`, status: null, ...inModule }),
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

/** Borra el clon "AurelIA - monitoreo de aire carga" con sus horas copiadas. */
export async function deleteMonitoreoDeAirePreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
