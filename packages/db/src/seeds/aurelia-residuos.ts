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
 * Carga de la ficha de Leslie `AurelIA-Residuos-proyecto-kora.xlsx` (corte 23/10/2026) en el proyecto
 * REAL "AurelIA - Residuos y Bodega Resiter" (`legacy_id = 137`, del sync de la v1 — se resuelve por
 * `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Residuos y Bodega Resiter carga" con una COPIA de las horas; `real` aplica sobre el
 * proyecto real (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Residuos y Bodega Resiter", 1.000 HH, 24/06–21/09) que recorre las etapas del Panel de
 * Control (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`); etapa de avance del proyecto:
 * `testing` (Presentación 10-26: "En pruebas por G.F." desde la entrega del 29/09). Cada tramo lleva su
 * etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del Panel quedan en la
 * bitácora. HH vendidas: 1.000 (dato de la ficha; en Kora estaban en 679).
 *
 * Avance: 75% real / 95% esperado — real de la Presentación AurelIA 10-26 (Levantamiento y Desarrollo
 * al 100%, Pruebas G.F. al 20%: 5 de 25), esperado del Panel (16/10 y 23/10). Ítems con peso (HH
 * estimadas = peso, sin colaborador asignado → no generan Forecast): las tareas "de etapa" de
 * Levantamiento y Desarrollo, la entrega del módulo a GF para pruebas del 29/09 (validada por la líder,
 * sin feedback de GF; pesa el promedio de las tareas — ver `project-progress.ts`), el avance logrado de
 * Pruebas G.F. (5 de 25, aprobado) y la "Aprobación Gold Fields" con el 20% restante, pendiente y
 * vencida desde la fecha de fin (21/09). Marcha blanca (5%) sin ítems: queda en la base, por eso el
 * esperado es 95%, como el Panel.
 *
 * Equipos como están en Kora (Desarrollo, UX-UI, QA, IA y PMO; RPA ya retirado): las 3 HH de José
 * Aponte (RPA) quedan en los tramos de Solmary. Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-residuos <preview|real|cleanup>`.
 */

const LEGACY_ID = 137;
const PREVIEW_NAME = 'AurelIA - Residuos y Bodega Resiter carga';
const PHASE = 'Residuos y Bodega Resiter';
const SOLD_HOURS = 1000;

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamIa: '7e96e0a9-86bb-44a9-96f2-46e3660e7ce4',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAlexis: 'cd1b5960-73d5-4160-b996-262224245c79', // UX-UI
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userConstanza: '993ba721-0f33-4eca-9967-7072c10a48b6', // QA
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userMariaJose: '0c18aac5-943e-4167-834e-c5d956f0c269', // Desarrollo (salió el 20/10)
  userNatalia: '91083daf-f6c0-4ba0-9a12-61ce0b3acb8a', // IA (líder)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Residuos
  userViktoriia: '1f873704-ada9-4eea-983b-aad7e5da8985', // IA
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Contrapartes: Catalina y Francisco. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  francisco: 'a5b10000-0000-4000-8000-000000000003',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
  daniel: 'a5b30000-0000-4000-8000-000000000001',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5bac000' : 'a5ba0000';
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
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Gestionar todo el ciclo de vida de los residuos (peligrosos y no peligrosos) generados en la operación, desde su ingreso a bodega hasta su disposición final, cumpliendo los plazos regulatorios (SIDREP/SINADER) y dando visibilidad del cumplimiento del umbral RCA.\n\nFuncionalidades: dashboard con umbral RCA por categoría; recepción en bodega (ingresos por lote, balance disponible/retirado); solicitud de retiro con flujo diferenciado: peligrosos (con aprobación y folio SIDREP) y no peligrosos (autónomo); bandeja de folios SIDREP con seguimiento de cierre; reporte SINADER mensual con 3 estados (En curso / Pendiente de declarar / Declarado).';

export interface SeedAureliaResiduosResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaResiduos(db: Database, target: FichaTarget): Promise<SeedAureliaResiduosResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Residuos y Bodega Resiter" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Residuos y Bodega Resiter" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Contraparte GF' },
        { id: CONTACTS.francisco, clientId, name: 'Francisco', position: 'Usuario / revisor GF' },
        { id: CONTACTS.elisa, clientId, name: 'Elisa', position: 'Aprobadora de diseño (SPR)' },
        { id: CONTACTS.daniel, clientId, name: 'Daniel', position: 'Responsable GF del módulo Controles críticos' },
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
        hito0At: d('2026-06-24'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 75,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas desde la entrega a GF del 29/09. Fin 21/09 (vencida).
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: SOLD_HOURS.toFixed(2),
      estimatedStartDate: d('2026-06-24'),
      estimatedEndDate: d('2026-09-21'),
    });

    // 4. Tramos T01–T12 (primer y último día con horas del equipo en la etapa), con su etapa al inicio
    //    del nombre; T03 y T09 (RPA, retirado del proyecto) van dentro de T01 y T05. T01 incluye 1,75 HH
    //    del 12/06, anteriores al Hito 0. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Levantamiento del flujo, propuesta de Residuos con el cliente, onboarding de la desarrolladora y estimación de HH (incluye seguimiento de la definición de José Aponte, RPA, 29/07)', start: '2026-06-12', end: '2026-08-03', users: [REAL.userAnaSoto, REAL.userMariaJose, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Levantamiento · Ideación, PRD, flujos de usuario, mockups, presentación y correcciones del diseño', start: '2026-07-09', end: '2026-07-30', users: [REAL.userAlexis] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción del módulo web (María José Tolmo)', start: '2026-08-06', end: '2026-09-28', users: [REAL.userMariaJose] },
      { team: REAL.teamDev, name: 'Desarrollo · Gestión con el cliente: definiciones del flujo, unidades de medida/toneladas, revisión con Elisa, K-Read y seguimiento del equipo (incluye entendimiento del proceso de José Aponte, RPA, 19–21/08)', start: '2026-08-17', end: '2026-09-28', users: [REAL.userSolmary] },
      { team: REAL.teamIa, name: 'Desarrollo · API de lectura de documentos (K-Read): nuevos campos y tipos de documento, revisión de arquitectura, configuración nginx', start: '2026-09-07', end: '2026-09-25', users: [REAL.userNatalia, REAL.userViktoriia] },
      { team: REAL.teamQa, name: 'Desarrollo · Estudio de documentación, test plan de Residuos y pruebas de correos (pruebas internas Kabeli)', start: '2026-08-28', end: '2026-09-25', users: [REAL.userConstanza] },
      { team: REAL.teamUx, name: 'Desarrollo · Soporte funcional al desarrollo, correcciones de flujo (Resolución exenta) y manuales de usuario por perfil', start: '2026-08-14', end: '2026-09-16', users: [REAL.userAlexis, REAL.userEduardo] },
      { team: REAL.teamDev, name: 'Pruebas · Correcciones durante pruebas GF: restauración de registros históricos y traducciones (i18n) del módulo', start: '2026-09-29', end: '2026-10-19', users: [REAL.userCarlo, REAL.userMariaJose] },
      { team: REAL.teamDev, name: 'Pruebas · Seguimiento de pruebas GF y gestión del histórico con el cliente', start: '2026-09-29', end: '2026-10-06', users: [REAL.userSolmary] },
      { team: REAL.teamQa, name: 'Pruebas · Test plan de perfiles Gerente y Superintendente y revisión de nuevos usuarios de retiro', start: '2026-10-05', end: '2026-10-05', users: [REAL.userConstanza] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entrega del módulo (web + IA) a GF para pruebas (H07, 29/09; el Gantt dice 30/09): planificada
    //    para la fecha de fin (21/09). Validada por la líder; GF sin feedback al corte (INC-02).
    const ENTREGA = 'Entrega del módulo (web + IA) a GF para pruebas';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryEntregaGf,
      moduleId: ID.module,
      teamId: REAL.teamDev,
      name: ENTREGA,
      description:
        'Módulo web + IA (K-Read) entregado a GF el 29/09 para pruebas ("Entregado a pruebas el 29/09", Panel 09/10; el Gantt indica 30/09), tras las pruebas internas de Kabeli y la aprobación de Elisa del 15/09. Validada por la líder; al 23/10 GF no entrega feedback ("Seguimos en espera").',
      assigneeUserId: REAL.userMariaJose,
      estimatedDate: d('2026-09-29'),
      status: 'approved',
      createdAt: at('2026-09-11'),
      updatedAt: at('2026-09-29', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Con la entrega pesando el promedio de las 4 tareas
    //    (190), los ítems suman 950 y la base es la fase (1.000): Levantamiento 300 (30%), Desarrollo
    //    210 + 190 (40%), Pruebas G.F. 50 logrado + 200 pendiente (25%); Marcha blanca (5%) sin ítems.
    //    Aprobado = 75%; vencido a hoy (todo, la aprobación de GF venció el 21/09) = 95%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '300.00', start: '2026-06-24', date: '2026-08-03', doneOn: '2026-08-03' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '210.00', start: '2026-08-04', date: '2026-09-11', doneOn: '2026-09-28' },
      { id: ID.taskPruebasLogrado, team: REAL.teamDev, name: 'Pruebas G.F.: avance logrado (5 de 25%)', scope: 'revision_cliente', hours: '50.00', start: '2026-09-29', date: '2026-09-21', doneOn: '2026-10-19' },
      { id: ID.taskAprobacionGf, team: REAL.teamDev, name: 'Aprobación Gold Fields: término de Pruebas G.F. (20 de 25%)', scope: 'revision_cliente', hours: '200.00', start: '2026-09-29', date: '2026-09-21', doneOn: null },
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
    //    incidentes e historial semanal del Panel (tabla Proyectos).
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryEntregaGf };
    const panels: [string, number, number, string][] = [
      ['2026-07-20', 0, 20, 'Fecha de fin "00-10-26"; esperado 0% (dato del Panel).'],
      ['2026-07-27', 20, 20, 'Fecha de fin TBD.'],
      ['2026-07-31', 20, 20, ''],
      ['2026-08-07', 30, 35, 'En desarrollo desde el 04/08.'],
      ['2026-08-14', 40, 38, 'La lámina de detalle dice 39/39; se usa la tabla Proyectos.'],
      ['2026-08-21', 50, 50, 'Consulta de unidades de medida.'],
      ['2026-08-28', 50, 50, 'Daniel resuelve dudas 27/08.'],
      ['2026-09-04', 60, 60, 'Elisa aprobó el flujo 03/09.'],
      ['2026-09-11', 65, 65, 'Pruebas internas.'],
      ['2026-09-25', 95, 68, 'Aprobado por Elisa 15/09.'],
      ['2026-10-02', 95, 70, 'La lámina de detalle dice 95/68.'],
      ['2026-10-09', 95, 70, 'Entregado a pruebas el 29/09.'],
      ['2026-10-16', 95, 70, 'Seguimos en espera.'],
      ['2026-10-23', 95, 75, 'Presentación AurelIA 10-26: 75% (fuente oficial del avance; "En pruebas por G.F."). El Panel del 23/10 aún muestra 70% real.'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-06-24', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),
      log('2026-10-23', 0, REAL.userClaudio, `HH vendidas actualizadas de 679 a ${SOLD_HOURS}.`),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-08-03', 30, S, 'Etapa Levantamiento · peso 30% · 24/06–03/08 · 97,5 HH reales (incluye 1,75 HH del 12/06, anteriores al Hito 0) · avance 100%. Propuesta de diseño mostrada al cliente el 30/07; estimación de HH y fecha de término el 03/08.', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-09-28', 30, S, 'Etapa Desarrollo · peso 40% · 04/08–28/09 · 346,25 HH reales · avance 100%. Incluye las pruebas internas de Kabeli (QA desde el 28/08, "Fase de pruebas Kabeli" 11/09), la integración con K-Read y la aprobación del módulo por Elisa (15/09).', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-09-29', 30, S, 'Etapa Pruebas G.F. · peso 25% · desde el 29/09 · 51 HH reales · avance 20% (5 de 25, según la Presentación AurelIA 10-26). Módulo entregado a GF para pruebas; correcciones del histórico y traducciones mientras se espera el feedback.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso', status: 'activo', ...inModule }),
      log('2026-09-29', 31, S, 'Etapa Marcha blanca · peso 5% · sin iniciar. Comienza con la aprobación de GF (OK cliente).', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Entrega a GF y tareas.
      log('2026-09-11', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-09-21')}.`, onDelivery),
      log('2026-09-22', 1, S, `Entrega "${ENTREGA}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-09-21')} a ${fmt('2026-09-29')}.`, onDelivery),
      log('2026-09-29', 0, REAL.userMariaJose, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-09-29', '2026-09-29')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-09-29', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-09-29', '2026-09-29')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-07-30', 40, S, 'Muestra de la propuesta de diseño al cliente (registro de horas de Solmary y Alexis).', { type: 'hito', title: 'Propuesta de diseño mostrada al cliente', status: 'cumplido', ...inModule }),
      log('2026-08-04', 40, S, 'Inicio de desarrollo ("en desarrollo desde el martes 04-08-26", Panel 07/08 y 14/08).', { type: 'hito', title: 'Inicio de desarrollo', status: 'cumplido', ...inModule }),
      log('2026-08-27', 40, S, 'Daniel (GF) resuelve las dudas de unidades de medida y toneladas (consulta enviada el 25/08; Panel 28/08).', { type: 'hito', title: 'Cliente resuelve dudas de unidades y toneladas', status: 'cumplido', ...inModule }),
      log('2026-09-03', 40, S, 'Elisa aprueba el flujo en la reunión de revisión del flujo completo (Panel 04/09 y registro de Solmary; el Gantt dice 26/08).', { type: 'hito', title: 'Elisa aprueba el flujo', status: 'cumplido', ...inModule }),
      log('2026-09-11', 40, S, 'Fase de pruebas internas Kabeli (Gantt 28-Sept y Panel 11/09).', { type: 'hito', title: 'Fase de pruebas internas Kabeli', status: 'cumplido', ...inModule }),
      log('2026-09-15', 40, S, 'Elisa aprueba el módulo con los cambios solicitados (Panel 25/09).', { type: 'hito', title: 'Elisa aprueba el módulo con los cambios', status: 'cumplido', ...inModule }),
      log('2026-09-22', 40, S, `Aprobación de Gold Fields (OK cliente) planificada para el ${fmt('2026-09-21')}, fecha de fin del formulario: vencida. La entrega a GF fue el 29/09 y al 23/10 no hay feedback.`, { type: 'compromiso', title: 'Aprobación Gold Fields (fin 21/09, vencida)', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-21', 10, S, 'Aclaración de unidades de medida y conversión a toneladas por tipo de residuo (necesario para el maestro y los umbrales RCA). Solicitud por correo; consulta 25/08. Resuelto por Daniel el 27/08.\nTipo: Definición pendiente del cliente · Origen: Externo · Cerrado: 27/08.', { type: 'incidente', title: 'INC-01 · Unidades de medida y toneladas por tipo de residuo', status: 'resuelto', ...inModule }),
      log('2026-09-22', 10, S, 'Fecha de fin 21/09 vencida: la entrega a GF fue el 29/09 y la aprobación de GF sigue pendiente.\nTipo: Atraso en entrega · Origen: Externo · Relacionado: INC-02.', { type: 'incidente', title: 'INC-03 · Atraso: fecha de fin 21/09 vencida', status: 'abierto', ...inModule }),
      log('2026-09-29', 10, S, 'Módulo entregado a GF el 29/09 para pruebas; al 23/10 GF no entrega feedback ("Seguimos en espera"). La Presentación 10-26 indica que falta feedback de todos los módulos entregados.\nTipo: Espera de feedback cliente · Origen: Externo.', { type: 'incidente', title: 'INC-02 · Espera de feedback de GF sobre la entrega', status: 'abierto', ...inModule }),

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

/** Borra el clon "AurelIA - Residuos y Bodega Resiter carga" con sus horas copiadas. */
export async function deleteResiduosPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
