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
 * Carga de la ficha de Leslie `AurelIA-Impuesto-verde-proyecto-kora.xlsx` (corte 22/10/2026) en el
 * proyecto REAL "AurelIA - Impuesto verde" (`legacy_id = 46`, del sync de la v1 — se resuelve por
 * `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Impuesto verde carga" con una COPIA de las horas; `real` aplica sobre el proyecto real
 * (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Impuesto verde", 1.647 HH, 12/06–26/10) que recorre las etapas del Panel de Control
 * (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`); etapa de avance del proyecto: `testing`
 * (ya estaba así en el formulario) desde la entrega web del 30/09. Cada tramo lleva su etapa al inicio
 * del nombre; etapas, hitos, incidentes y el historial semanal del Panel quedan en la bitácora.
 *
 * Avance: 75% real / 80% esperado, el del Panel 23/10 (la Presentación AurelIA 10-26 dice 85%; la ficha
 * toma el Panel) — Levantamiento y Desarrollo al 100%, Pruebas G.F. al 20% (5 de 25) contra 40%
 * esperado (10 de 25). Ítems con peso (HH estimadas = peso, sin colaborador asignado → no generan
 * Forecast): las tareas "de etapa" de Levantamiento y Desarrollo, la entrega web a GF del 30/09 (pesa el
 * promedio de las tareas — ver `project-progress.ts`), el avance logrado de Pruebas G.F. (5 de 25,
 * aprobado) y el planificado al Panel del 09/10 (otros 5, pendiente y vencido), la "Aprobación Gold
 * Fields" (15 restantes) y la Marcha blanca, pendientes al 26/10. Hoy 75/80; si pasa el 26/10 sin
 * aprobación de GF, Kora muestra el atraso (esperado 100%).
 *
 * Equipos como están en Kora (Desarrollo, UX-UI, QA, RPA, IA y PMO). Estado: Activo, como el
 * formulario. HH vendidas: las del formulario (1.647).
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-impuesto-verde <preview|real|cleanup>`.
 */

const LEGACY_ID = 46;
const PREVIEW_NAME = 'AurelIA - Impuesto verde carga';
const PHASE = 'Impuesto verde';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamIa: '7e96e0a9-86bb-44a9-96f2-46e3660e7ce4',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userFrancisca: 'c3aaa952-108a-4510-b61c-1dec8e23f479', // QA
  userFranz: 'bb0d50a1-8a79-4044-9c58-e72e21f91b24', // IA
  userJorge: 'b80aa895-55f5-4756-9e9b-bebccd5c04f2', // RPA
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userLiliana: 'b062dff8-f80f-4d8f-9993-98b5a90c47d4', // UX-UI
  userMarco: 'd29f7d6b-10ba-4ddb-8f21-cbfaea71f2fe', // Desarrollo
  userPabloHaiquel: '43c2c723-b690-42c7-af02-e927fb7bf7f4', // RPA
  userPabloVega: '91fce407-a72d-4875-ab65-faef05c8044f', // RPA
  userSergio: 'b9b920d3-4647-4907-a19b-fa2daec9c01f', // IA
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Impuesto verde
  userViktoriia: '1f873704-ada9-4eea-983b-aad7e5da8985', // IA
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Contrapartes: Tania y Catalina. */
const CONTACTS = {
  tania: 'a5b00000-0000-4000-8000-000000000001',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
  catalina: 'a5b10000-0000-4000-8000-000000000001',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5bbc000' : 'a5bb0000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryEntregaWeb: id(21),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    taskPruebasLogrado: id(33),
    taskPruebasPlanificado: id(34),
    taskAprobacionGf: id(35),
    taskMarchaBlanca: id(36),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Módulo N° 4 de AurelIA: Impuesto verde / Catastro Horno y Caldera. Catastro de fuentes fijas (hornos, calderas y generadores), reportabilidad (REAU/SISAT, carta SISAT), dashboard y análisis predictivo de emisiones, con carga manual de datos de consumo (Excel) donde no hay integración con los sistemas del cliente. Automatizaciones RPA (Rescate ID RFP, RUEA) en curso.';

export interface SeedAureliaImpuestoVerdeResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaImpuestoVerde(db: Database, target: FichaTarget): Promise<SeedAureliaImpuestoVerdeResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Impuesto verde" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Impuesto verde" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.tania, clientId, name: 'Tania', position: 'Contraparte GF' },
        { id: CONTACTS.elisa, clientId, name: 'Elisa', position: 'Aprobadora de diseño (SPR)' },
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Contraparte GF' },
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

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 75%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.tania,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-06-12'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 75,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas desde la entrega web del 30/09. Fin 26/10.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: '1647.00',
      estimatedStartDate: d('2026-06-12'),
      estimatedEndDate: d('2026-10-26'),
    });

    // 4. Tramos T01–T11 (primer y último día con horas del equipo en la etapa), con su etapa al inicio
    //    del nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Gestión, levantamiento de procesos y flujos con cliente (incluye maquetado frontend de Marco, 10–14/08)', start: '2026-06-12', end: '2026-08-14', users: [REAL.userSolmary, REAL.userAnaSoto, REAL.userMarco] },
      { team: REAL.teamUx, name: 'Levantamiento · Análisis PRD, levantamiento y diseño web (catastro, reportabilidad, dashboard, predictibilidad)', start: '2026-07-03', end: '2026-08-13', users: [REAL.userLiliana, REAL.userEduardo] },
      { team: REAL.teamRpa, name: 'Levantamiento · Levantamiento y presentación de automatizaciones', start: '2026-08-07', end: '2026-08-13', users: [REAL.userJoseAponte] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción front/back (catastro, reportabilidad, carta SISAT, dashboard, análisis predictivo), carga manual, bug fix QA y traducción ES/EN', start: '2026-08-17', end: '2026-09-30', users: [REAL.userMarco, REAL.userCarlo, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Desarrollo · Ajustes flujo catastro y vista SISAT, manual de usuario', start: '2026-08-27', end: '2026-09-22', users: [REAL.userLiliana] },
      { team: REAL.teamQa, name: 'Desarrollo · Diseño y ejecución de casos de prueba (catastro, dashboard, predictivo, REAU/SISAT, reportabilidad)', start: '2026-08-31', end: '2026-09-30', users: [REAL.userFrancisca] },
      { team: REAL.teamRpa, name: 'Desarrollo · Reuniones de automatización, levantamiento de procesos de robots, estimación y credenciales', start: '2026-08-20', end: '2026-09-30', users: [REAL.userJoseAponte, REAL.userJorge, REAL.userPabloHaiquel, REAL.userPabloVega] },
      { team: REAL.teamIa, name: 'Desarrollo · EDA y desarrollo RAG del módulo', start: '2026-08-24', end: '2026-08-31', users: [REAL.userSergio, REAL.userFranz, REAL.userViktoriia] },
      { team: REAL.teamDev, name: 'Pruebas · Correcciones por feedback GF (correo), datos históricos 2024-2025, traducciones y cambios solicitados por Tania (reglas MGE)', start: '2026-10-01', end: '2026-10-20', users: [REAL.userMarco, REAL.userCarlo, REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Pruebas · Cierre de casos de prueba de Reportabilidad', start: '2026-10-01', end: '2026-10-07', users: [REAL.userFrancisca] },
      { team: REAL.teamRpa, name: 'Pruebas · Desarrollo RPA Rescate ID RFP y RPA RUEA', start: '2026-10-02', end: '2026-10-06', users: [REAL.userPabloHaiquel] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entrega WEB – procedimiento manual (H08, 30/09 según Hitos 28-Sept; el Panel del 02/10 dice "se
    //    entrega hoy"): paso a pruebas de Gold Fields.
    const ENTREGA = 'Entrega WEB – procedimiento manual (paso a pruebas GF)';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryEntregaWeb,
      moduleId: ID.module,
      teamId: REAL.teamDev,
      name: ENTREGA,
      description:
        'Módulo web con procedimiento manual (carga de datos por Excel) entregado a GF para pruebas el 30/09 (Hitos 28-Sept; el Panel del 02/10 dice "se entrega hoy"). Desde ahí, correcciones por feedback de GF por correo y cambios solicitados por Tania (reglas MGE).',
      assigneeUserId: REAL.userMarco,
      estimatedDate: d('2026-09-30'),
      status: 'approved',
      createdAt: at('2026-08-17'),
      updatedAt: at('2026-09-30', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Con la entrega pesando el promedio de las 6 tareas
    //    (235,29), el total da 1.647: Levantamiento 494,1 (30%), Desarrollo 423,51 + 235,29 (40%), Pruebas
    //    G.F. 82,35 logrado + 82,35 planificado al 09/10 + 247,05 restante (25%) y Marcha blanca 82,35
    //    (5%). Aprobado = 75%; vencido a hoy (hasta el planificado al 09/10) = 80%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '494.10', start: '2026-06-12', date: '2026-08-14', doneOn: '2026-08-14' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '423.51', start: '2026-08-17', date: '2026-09-30', doneOn: '2026-09-30' },
      { id: ID.taskPruebasLogrado, team: REAL.teamDev, name: 'Pruebas G.F.: avance logrado (5 de 25%)', scope: 'revision_cliente', hours: '82.35', start: '2026-10-01', date: '2026-10-09', doneOn: '2026-10-09' },
      { id: ID.taskPruebasPlanificado, team: REAL.teamDev, name: 'Pruebas G.F.: avance planificado al Panel 09/10 (otros 5 de 25%)', scope: 'revision_cliente', hours: '82.35', start: '2026-10-01', date: '2026-10-09', doneOn: null },
      { id: ID.taskAprobacionGf, team: REAL.teamDev, name: 'Aprobación Gold Fields: término de Pruebas G.F. (15 de 25%)', scope: 'revision_cliente', hours: '247.05', start: '2026-10-01', date: '2026-10-26', doneOn: null },
      { id: ID.taskMarchaBlanca, team: REAL.teamDev, name: 'Marcha blanca (peso 5%)', scope: 'revision_cliente', hours: '82.35', start: '2026-10-01', date: '2026-10-26', doneOn: null },
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
    //    historial semanal del Panel (tabla resumen).
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryEntregaWeb };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 20, 20, 'Fecha de fin TBD.'],
      ['2026-07-31', 20, 20, ''],
      ['2026-08-03', 40, 23, ''],
      ['2026-08-14', 40, 30, 'La tabla resumen dice 30% real y la lámina de detalle 23%; se usa la tabla resumen.'],
      ['2026-08-21', 45, 40, 'Fecha de fin 26/10 aparece por primera vez.'],
      ['2026-08-28', 55, 55, ''],
      ['2026-09-04', 60, 60, ''],
      ['2026-09-11', 65, 63, ''],
      ['2026-09-25', 65, 65, ''],
      ['2026-10-02', 68, 63, ''],
      ['2026-10-09', 80, 75, ''],
      ['2026-10-16', 80, 75, ''],
      ['2026-10-23', 80, 75, 'La lámina de detalle conserva el título "16-10-2026". La Presentación AurelIA 10-26 muestra 85%; la ficha toma el Panel.'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-06-12', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-08-14', 30, S, 'Etapa Levantamiento · peso 30% · 12/06–14/08 · 203,9 HH reales · avance 100%. Incluye el maquetado frontend de Marco del 10 al 14/08 (el hito de inicio de desarrollo es el 17/08).', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-09-30', 30, S, 'Etapa Desarrollo · peso 40% · 17/08–30/09 · 457,25 HH reales · avance 100%. Termina con la entrega web a GF (procedimiento manual).', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-01', 30, S, 'Etapa Pruebas G.F. · peso 25% · 01/10–26/10 · 71,75 HH reales · avance 20% (5 de 25, Panel 23/10; esperado 10 de 25). Correcciones por feedback de GF, datos históricos y cambios de Tania.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso', status: 'activo', ...inModule }),
      log('2026-10-01', 31, S, 'Etapa Marcha blanca · peso 5% (en el Panel está sobre "Aprobado"; Kora no tiene esa etapa) · sin iniciar.', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Entrega web y tareas.
      log('2026-08-17', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-09-30')}.`, onDelivery),
      log('2026-09-30', 0, REAL.userMarco, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-09-30', '2026-09-30')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-09-30', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-09-30', '2026-09-30')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-08-07', 40, S, 'Reuniones de levantamiento detallado con el cliente (06 y 07/08; Panel 07-08).', { type: 'hito', title: 'Reuniones de levantamiento detallado con el cliente', status: 'cumplido', ...inModule }),
      log('2026-08-13', 40, S, 'Término de la propuesta de diseño web: cierre del flujo web (Hitos 28-Sept / Panel 14-08).', { type: 'hito', title: 'Término de propuesta de diseño web', status: 'cumplido', ...inModule }),
      log('2026-08-17', 40, S, 'Inicio de desarrollo (Hitos 28-Sept).', { type: 'hito', title: 'Inicio de desarrollo', status: 'cumplido', ...inModule }),
      log('2026-08-24', 40, S, 'Reunión de automatización: se acuerda un Excel de consumos para el área de Miguel Montecinos (Panel 28-08).', { type: 'hito', title: 'Reunión de automatización (Excel de consumos)', status: 'cumplido', ...inModule }),
      log('2026-09-03', 40, S, 'Elisa aprueba el módulo / flujo (Hitos 28-Sept / Panel 04-09). Ese día se envía el correo que explica la integración entre plataformas y el Excel para Miguel Montecinos y GGEE.', { type: 'hito', title: 'Elisa aprueba el módulo · correo de integración y Excel', status: 'cumplido', ...inModule }),
      log('2026-09-16', 40, S, 'Levantamiento de procesos para automatización (robots) (Hitos 28-Sept / registro de horas).', { type: 'hito', title: 'Levantamiento de procesos para robots', status: 'cumplido', ...inModule }),
      log('2026-10-19', 40, S, 'Reunión con Tania: revisión de perfiles, feedback y explicación de uso (Panel 16-10 / registro de horas).', { type: 'hito', title: 'Reunión con Tania (perfiles y feedback)', status: 'cumplido', ...inModule }),
      log('2026-10-22', 40, S, `Fecha de fin / entrega estimada del módulo: ${fmt('2026-10-26')} (formulario y Panel). En riesgo: queda el 25% (Pruebas G.F. y Marcha blanca) e INC-03 abierto.`, { type: 'compromiso', title: 'Fecha de fin 26/10 (en riesgo)', status: 'pendiente', ...inModule }),
      log('2026-10-22', 41, S, `Inicio de desarrollo de robots planificado para el ${fmt('2026-11-15')} (Hitos 28-Sept), posterior a la fecha de fin. Pablo Haiquel ya registró desarrollo RPA (Rescate ID RFP y RUEA) del 02 al 06/10: revisar si la fecha de fin debe moverse o si los robots quedan fuera de este módulo.`, { type: 'compromiso', title: 'Inicio de desarrollo de robots 15/11', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-07', 10, S, 'Atraso del levantamiento por disponibilidad de áreas externas que deben indicar cómo obtener los datos de consumo (hornos, calderas y generadores).\nTipo: Espera de información cliente · Origen: Externo · Cerrado: 03/09.', { type: 'incidente', title: 'INC-01 · Atraso del levantamiento por áreas externas', status: 'resuelto', ...inModule }),
      log('2026-08-27', 10, S, 'Flujos que no se integran con sistemas del cliente: se rediseñan con carga manual de datos (Excel) en catastro, dashboard y reportabilidad.\nTipo: Cambio de alcance · Origen: Externo · Cerrado: 28/08 · Relacionado: INC-01.', { type: 'incidente', title: 'INC-02 · Rediseño con carga manual de datos (Excel)', status: 'resuelto', ...inModule }),
      log('2026-10-02', 10, S, 'Faltan credenciales (Clave Única / SMA) para automatizar los procesos; Catalina lo está revisando. Retrasa la automatización.\nTipo: Bloqueo externo · Origen: Externo.', { type: 'incidente', title: 'INC-03 · Faltan credenciales (Clave Única / SMA) para los robots', status: 'abierto', ...inModule }),
      log('2026-10-09', 10, S, 'Tania reporta inconvenientes con los perfiles; Kabeli revisa sin encontrar problemas y se agenda revisión conjunta (19/10).\nTipo: Reporte de cliente · Origen: Externo · Cerrado: 19/10.', { type: 'incidente', title: 'INC-04 · Tania reporta inconvenientes con los perfiles', status: 'resuelto', ...inModule }),

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

/** Borra el clon "AurelIA - Impuesto verde carga" con sus horas copiadas. */
export async function deleteImpuestoVerdePreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
