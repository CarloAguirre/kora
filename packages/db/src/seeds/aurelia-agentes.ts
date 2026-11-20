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
 * Carga de la ficha de Leslie `AurelIA-Agentes-proyecto-kora.xlsx` (corte 23/10/2026) en el proyecto
 * REAL "AurelIA - Agentes" (`legacy_id = 226`, del sync de la v1 — se resuelve por `legacyId`). Mismos
 * destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon "AurelIA - Agentes carga" con
 * una COPIA de las horas; `real` aplica sobre el proyecto real (sin crear ni borrar horas, solo las
 * imputa a la fase).
 *
 * UNA fase ("Agentes", 1.000 HH, 21/07–23/10) que recorre las etapas del Panel de Control
 * (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`); etapa de avance del proyecto: `testing`
 * (la ficha recomienda cambiar "En desarrollo" por Pruebas desde la entrega a GF del 12/10). Cada tramo
 * lleva su etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del Panel
 * quedan en la bitácora. HH vendidas: 1.000 (dato de la ficha; en Kora estaban en 0).
 *
 * Avance: 75% real / 70% esperado — real de la Presentación AurelIA 10-26 (Levantamiento y Desarrollo
 * al 100%, Pruebas G.F. al 20%: 5 de 25), esperado del Panel 23/10. Ítems con peso (HH estimadas =
 * peso, sin colaborador asignado → no generan Forecast): las tareas "de etapa" de Levantamiento y
 * Desarrollo, la entrega a GF para pruebas del 12/10 (validada por la líder, con feedback de GF en
 * corrección; pesa el promedio de las tareas — ver `project-progress.ts`), el avance logrado de Pruebas
 * G.F. (5 de 25, aprobado) y la "Aprobación Gold Fields" y la Marcha blanca, pendientes. Lo de Pruebas
 * y Marcha blanca vence el 23/10 (fecha de término): hoy 75/70; si pasa el 23/10 sin aprobación de GF,
 * Kora muestra el atraso (esperado 100%).
 *
 * Equipos como están en Kora (IA, RPA, Desarrollo, QA). Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-agentes <preview|real|cleanup>`.
 */

const LEGACY_ID = 226;
const PREVIEW_NAME = 'AurelIA - Agentes carga';
const PHASE = 'Agentes';
const SOLD_HOURS = 1000;

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamIa: '7e96e0a9-86bb-44a9-96f2-46e3660e7ce4',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',

  userFrancisca: 'c3aaa952-108a-4510-b61c-1dec8e23f479', // QA
  userFranz: 'bb0d50a1-8a79-4044-9c58-e72e21f91b24', // IA
  userJairo: 'b08b1924-8fd0-40f0-8123-48e99a288b34', // IA (también RPA)
  userJavier: '747699a2-070c-441d-b72b-4e7aec3dee83', // IA (salió el 15/10)
  userNatalia: '91083daf-f6c0-4ba0-9a12-61ce0b3acb8a', // IA (líder) — líder de Agentes
  userSergio: 'b9b920d3-4647-4907-a19b-fa2daec9c01f', // IA
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // Desarrollo (seguimiento PM)
  userUriel: '61131ccf-758e-4181-a0dd-a7bb84917353', // IA
  userViktoriia: '1f873704-ada9-4eea-983b-aad7e5da8985', // IA
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Contrapartes: Catalina y Marjorie. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b9c000' : 'a5b90000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryEntregaGf: id(21),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    taskPruebasLogrado: id(33),
    taskAprobacionGf: id(34),
    taskMarchaBlanca: id(35),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'AurelIA asistente: reducir la fricción del usuario durante el llenado de formularios y la ejecución de flujos complejos, respondiendo dudas en lenguaje natural sin consultar manuales ni interrumpir el trabajo. Chatbot disponible en las pantallas de escritorio de la plataforma AurelIA, accesible mediante un botón flotante.\n\nFuncionalidades: mensaje de bienvenida contextualizado a la pantalla del módulo; chips de preguntas frecuentes según el momento; mensaje orientador y preguntas sugeridas que se actualizan al avanzar; preguntas en lenguaje natural, con búsqueda primero en una biblioteca local de respuestas precargadas.\n\nConocimiento cargado: Inspecciones, Incidentes, Impuesto verde, Residuos, SPR, Capacitaciones ambientales, Monitoreo de agua, Monitoreo de aire, Gestión documental y Sustancias peligrosas.';

export interface SeedAureliaAgentesResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaAgentes(db: Database, target: FichaTarget): Promise<SeedAureliaAgentesResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Agentes" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Agentes" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Contraparte GF' },
        { id: CONTACTS.marjorie, clientId, name: 'Marjorie', position: 'Contraparte GF' },
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

    // 2. Datos generales + HH vendidas + Hito 0 manual. `actualProgress` = caché de
    //    `ProjectProgressRecalculator`: 75%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        soldHours: SOLD_HOURS.toFixed(2),
        hito0At: d('2026-07-21'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 75,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas desde la entrega a GF del 12/10. Fin 23/10.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: SOLD_HOURS.toFixed(2),
      estimatedStartDate: d('2026-07-21'),
      estimatedEndDate: d('2026-10-23'),
    });

    // 4. Tramos T01–T10 (primer y último día con horas del equipo en la etapa), con su etapa al inicio
    //    del nombre. T01 y parte de T02 son anteriores al Hito 0 (horas imputadas al proyecto). Sin
    //    `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamIa, name: 'Levantamiento · Sesión preliminar del agente (previa al Hito 0)', start: '2026-05-27', end: '2026-05-27', users: [REAL.userFranz, REAL.userNatalia, REAL.userViktoriia] },
      { team: REAL.teamIa, name: 'Levantamiento · Levantamiento y base del Agente AurelIA (julio sin detalle de actividad; 03–06/08 "Agente AurelIA")', start: '2026-07-02', end: '2026-08-06', users: [REAL.userSergio, REAL.userFranz, REAL.userNatalia] },
      { team: REAL.teamIa, name: 'Desarrollo · Desarrollo del agente general: RAGs, EDAs por módulo, schemas Postgres + pgvector, system prompt y entregas corregidas por módulo', start: '2026-08-07', end: '2026-10-02', users: [REAL.userSergio, REAL.userJavier, REAL.userViktoriia, REAL.userFranz, REAL.userJairo] },
      { team: REAL.teamIa, name: 'Desarrollo · Revisión de informes, reuniones de revisión y evaluación de nuevas features (líder IA)', start: '2026-08-17', end: '2026-09-29', users: [REAL.userNatalia] },
      { team: REAL.teamIa, name: 'Desarrollo · Pruebas del clasificador de criticidad en incidentes', start: '2026-08-28', end: '2026-08-28', users: [REAL.userUriel] },
      { team: REAL.teamIa, name: 'Desarrollo · Seguridad y migración: hallazgos y mitigación, despliegue y migración a máquina Azure de Gold Fields', start: '2026-09-02', end: '2026-09-30', users: [REAL.userFranz, REAL.userSergio] },
      { team: REAL.teamDev, name: 'Desarrollo · Seguimiento PM: acceso a LLM, revisión con equipo IA y seguimiento de desarrollo y horas', start: '2026-08-25', end: '2026-09-30', users: [REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Desarrollo · Casos de prueba Chat Box: regresión Residuos y SPR (23/09) y diseño/ejecución para 5 módulos (09/10)', start: '2026-09-23', end: '2026-10-09', users: [REAL.userFrancisca] },
      { team: REAL.teamQa, name: 'Pruebas · Ejecución de casos de prueba de módulos faltantes (Gestión documental y Sustancias peligrosas)', start: '2026-10-13', end: '2026-10-13', users: [REAL.userFrancisca] },
      { team: REAL.teamIa, name: 'Pruebas · Corrección del feedback recibido de Gold Fields', start: '2026-10-20', end: '2026-10-21', users: [REAL.userSergio] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. 1ra entrega a GF para pruebas de usuario (H05, 12/10, Gantt "Inicio pruebas de usuario"). Validada
    //    por la líder; GF devolvió feedback con correcciones, en curso el 20–21/10.
    const ENTREGA = 'Entrega del agente a GF para pruebas de usuario';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryEntregaGf,
      moduleId: ID.module,
      teamId: REAL.teamIa,
      name: ENTREGA,
      description:
        'Agente entregado a GF el 12/10 para pruebas de usuario ("Se entregó para pruebas a Gold Fields", Panel 16/10), con el conocimiento de los 10 módulos cargado. Validada por la líder; GF devolvió feedback con correcciones, en curso el 20–21/10 (iteración 1).',
      assigneeUserId: REAL.userSergio,
      estimatedDate: d('2026-10-12'),
      status: 'approved',
      createdAt: at('2026-10-05'),
      updatedAt: at('2026-10-12', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Con la entrega pesando el promedio de las 5 tareas
    //    (166,67), el total da 1.000: Levantamiento 300 (30%), Desarrollo 233,33 + 166,67 (40%), Pruebas
    //    G.F. 50 logrado + 200 pendiente (25%) y Marcha blanca 50 (5%). Aprobado = 75%; vencido a hoy
    //    (Levantamiento, Desarrollo y la entrega) = 70%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '300.00', start: '2026-07-21', date: '2026-08-06', doneOn: '2026-08-06' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '233.33', start: '2026-08-07', date: '2026-10-05', doneOn: '2026-10-11' },
      { id: ID.taskPruebasLogrado, team: REAL.teamIa, name: 'Pruebas G.F.: avance logrado (5 de 25%)', scope: 'revision_cliente', hours: '50.00', start: '2026-10-12', date: '2026-10-23', doneOn: '2026-10-21' },
      { id: ID.taskAprobacionGf, team: REAL.teamIa, name: 'Aprobación Gold Fields: término de Pruebas G.F. (20 de 25%)', scope: 'revision_cliente', hours: '200.00', start: '2026-10-12', date: '2026-10-23', doneOn: null },
      { id: ID.taskMarchaBlanca, team: REAL.teamIa, name: 'Marcha blanca (peso 5%)', scope: 'revision_cliente', hours: '50.00', start: '2026-10-12', date: '2026-10-23', doneOn: null },
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

    // 7. Bitácora: HH vendidas y Hito 0, etapas, entrega y tareas (mismos textos que la API), hitos,
    //    incidentes e historial semanal del Panel (lámina Proyectos).
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryEntregaGf };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 8, 8, 'Término TBD.'],
      ['2026-07-31', 8, 8, ''],
      ['2026-08-03', 8, 8, ''],
      ['2026-08-14', 8, 8, ''],
      ['2026-08-21', 10, 10, 'Pasa del N° 12 al N° 15.'],
      ['2026-08-28', 15, 15, ''],
      ['2026-09-04', 20, 20, ''],
      ['2026-09-11', 20, 20, ''],
      ['2026-09-25', 65, 65, 'El agente tiene todo el conocimiento de cada módulo con la información suministrada. Está en fase de entrenamiento y pruebas internas. Fecha de término 23/10.'],
      ['2026-10-02', 68, 68, 'Fase de entrenamiento y pruebas internas.'],
      ['2026-10-09', 68, 69, 'Se sigue con pruebas y se entregará la semana que viene. (La lámina del agente dice 68/68; la tabla Proyectos, 68/69.)'],
      ['2026-10-16', 70, 70, 'Se entregó para pruebas a Gold Fields.'],
      ['2026-10-23', 70, 75, 'Presentación AurelIA 10-26: 75% (fuente oficial del avance; lámina Fases 23-10-2026, "AurelIA asistente – En pruebas por G.F."). El Panel del 23/10 repetía 70/70.'],
    ];
    const N = REAL.userNatalia;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-07-21', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),
      log('2026-10-22', 0, REAL.userClaudio, `HH vendidas actualizadas de 0 a ${SOLD_HOURS}.`),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-08-06', 30, N, 'Etapa Levantamiento · peso 30% · 21/07–06/08 · 212 HH reales (incluye 121 HH anteriores al Hito 0: 27/05 y 02–20/07) · avance 100%.', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-11', 30, N, 'Etapa Desarrollo · peso 40% · 07/08–11/10 · 392,5 HH reales · avance 100%. El Gantt marca fin de desarrollo el 05/10; entre el 06 y el 11/10 hubo pruebas internas antes de la entrega del 12/10.', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-12', 30, N, 'Etapa Pruebas G.F. · peso 25% · 12/10–23/10 · 12 HH reales · avance 20% (5 de 25, según la Presentación AurelIA 10-26). Agente entregado a GF para pruebas de usuario; feedback con correcciones en curso (20–21/10).', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso', status: 'activo', ...inModule }),
      log('2026-10-12', 31, N, 'Etapa Marcha blanca · peso 5% (en el Panel está sobre "Aprobado"; Kora no tiene esa etapa) · sin iniciar.', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Entrega a GF y tareas.
      log('2026-10-05', 0, N, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-10-12')}.`, onDelivery),
      log('2026-10-12', 0, REAL.userSergio, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-10-12', '2026-10-12')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-10-12', 5, N, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-10-12', '2026-10-12')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, N, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, N, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-08-07', 40, N, 'Inicio de desarrollo del agente (Gantt Hitos 28 Sept).', { type: 'hito', title: 'Inicio de desarrollo del agente', status: 'cumplido', ...inModule }),
      log('2026-09-02', 40, N, 'Agente AurelIA General desplegado en infraestructura Kabeli IA, con conocimiento de Inspecciones, Incidentes e Impuesto verde (registro de horas de Sergio Moreno).', { type: 'hito', title: 'Agente General desplegado en infraestructura Kabeli IA', status: 'cumplido', ...inModule }),
      log('2026-09-22', 40, N, 'Entrega corregida de Inspecciones, Incidentes, Impuesto verde, Residuos y SPR para el agente; regresión QA el 23/09 (OK QA).', { type: 'hito', title: 'Entrega corregida de 5 módulos y regresión QA', status: 'cumplido', ...inModule }),
      log('2026-10-05', 40, N, 'Fin de desarrollo: conocimiento de los 10 módulos cargado (Gantt Hitos 28 Sept, registro 29/09).', { type: 'hito', title: 'Fin de desarrollo (10 módulos cargados)', status: 'cumplido', ...inModule }),
      log('2026-10-21', 40, N, `Aprobación de Gold Fields (OK cliente) planificada para el ${fmt('2026-10-23')}, fecha de término del proyecto. Quedan el 80% de Pruebas G.F. y la Marcha blanca, con el feedback de GF en corrección: es probable que la fecha se mueva.`, { type: 'compromiso', title: 'Aprobación de Gold Fields 23/10', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-09-02', 10, N, 'Espera de credenciales para migrar el agente desde la infraestructura Kabeli IA a la de Gold Fields. Migración a máquina Azure de GF registrada el 30/09 (Franz Molina).\nTipo: Otro · Origen: Externo · Severidad: Media (supuesto) · Cerrado: 30/09 (inferido; confirmar con Natalia Jaña).', { type: 'incidente', title: 'INC-01 · Espera de credenciales para migrar a la infraestructura de GF', status: 'resuelto', ...inModule }),
      log('2026-09-03', 10, N, 'Hallazgos de seguridad en la base de datos vectorial del agente general. Plan de mitigación de seguridad ejecutado el 14–15/09.\nTipo: Bloqueo técnico · Origen: Interno · Severidad: Media (supuesto) · Cerrado: 15/09.', { type: 'incidente', title: 'INC-02 · Hallazgos de seguridad en la BD vectorial', status: 'resuelto', ...inModule }),

      // Historial semanal de avance.
      ...panels.map((panel) => panelObservation(log, N, PHASE, inModule, panel)),
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

/** Borra el clon "AurelIA - Agentes carga" con sus horas copiadas. */
export async function deleteAgentesPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
