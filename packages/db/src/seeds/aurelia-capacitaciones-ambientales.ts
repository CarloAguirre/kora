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
 * Carga de la ficha de Leslie `AurelIA-Capacitaciones-ambientales-proyecto-kora.xlsx` (corte 22/10/2026)
 * en el proyecto REAL "AurelIA - Capacitaciones ambientales" (`legacy_id = 208`, del sync de la v1 — se
 * resuelve por `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Capacitaciones ambientales carga" con una COPIA de las horas; `real` aplica sobre el proyecto
 * real (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Capacitaciones ambientales", 515 HH, 09/07–16/10) que recorre las etapas del Panel de
 * Control (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`, desde la entrega a GF del 19/10);
 * etapa de avance del proyecto: `testing`. Cada tramo lleva su etapa al inicio del nombre; etapas, hitos,
 * incidentes y el historial semanal del Panel quedan en la bitácora.
 *
 * Avance: 75% real / 75% esperado (Presentación AurelIA 10-26, confirmado por el usuario; la ficha asume
 * esperado = real) — Levantamiento y Desarrollo al 100%, Pruebas G.F. al 20% (5 de 25). Ítems con peso
 * (HH estimadas = peso, sin colaborador asignado → no generan Forecast): las tareas "de etapa" de
 * Levantamiento y Desarrollo, el avance logrado de Pruebas G.F. y las dos entregas aprobadas (propuesta
 * de diseño, aprobada por Elisa el 08/10, y la entrega a GF para pruebas de usuario del 19/10; cada una
 * pesa el promedio de las tareas — ver `project-progress.ts`). El resto de Pruebas y Marcha blanca (25%)
 * queda sin ítems: cuenta en la base pero ni en el real ni en el esperado. La aprobación de GF de la
 * fecha de fin (16/10, vencida) va a la bitácora: como tarea pendiente vencida subiría el esperado sobre
 * el 75% de la ficha.
 *
 * Equipos como están en Kora. Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-capacitaciones-ambientales <preview|real|cleanup>`.
 */

const LEGACY_ID = 208;
const PREVIEW_NAME = 'AurelIA - Capacitaciones ambientales carga';
const PHASE = 'Capacitaciones ambientales';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAlexis: 'cd1b5960-73d5-4160-b996-262224245c79', // UX-UI
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userConstanza: '993ba721-0f33-4eca-9967-7072c10a48b6', // QA
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userMarco: 'd29f7d6b-10ba-4ddb-8f21-cbfaea71f2fe', // Desarrollo
  userNicolas: 'f71af37d-8ad5-44f0-a1a7-03330fd3282f', // Desarrollo (desvinculado)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Capacitaciones ambientales
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Francisco Báez revisó los ajustes del 20/08. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
  francisco: 'a5b10000-0000-4000-8000-000000000003',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b6c000' : 'a5b60000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryDiseno: id(21),
    deliveryEntregaGf: id(22),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    taskPruebasLogrado: id(33),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Reemplazar el seguimiento manual en Excel del Programa Anual de Capacitación, con visibilidad automática del cumplimiento, alertas de vencimiento y un flujo formal de aprobación del plan anual.\n\nFuncionalidades: dashboard analítico; registro de capacitaciones ejecutadas con evidencia; constructor del Programa Anual con flujo de aprobación y firmas; distinción Programa/Extra; reagendamiento con trazabilidad de no conformidad; administración de temáticas, responsables, empresas y gerencias.';

export interface SeedAureliaCapacitacionesAmbientalesResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaCapacitacionesAmbientales(db: Database, target: FichaTarget): Promise<SeedAureliaCapacitacionesAmbientalesResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Capacitaciones ambientales" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Capacitaciones ambientales" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Responsable GF del módulo Inspecciones' },
        { id: CONTACTS.marjorie, clientId, name: 'Marjorie', position: 'Responsable GF del módulo Inspecciones' },
        { id: CONTACTS.francisco, clientId, name: 'Francisco', position: 'Usuario / revisor GF' },
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

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 75%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-07-09'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 75,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas desde la entrega a GF del 19/10. Fin 16/10 vencido (espera de la aprobación de Elisa).
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: '515.00',
      estimatedStartDate: d('2026-07-09'),
      estimatedEndDate: d('2026-10-16'),
    });

    // 4. Tramos T01–T12 (primer y último registro de horas del tramo), con su etapa al inicio del nombre.
    //    Sin `dailyPercent`: son pasados, no deben generar Forecast. Pruebas G.F. aún no tiene horas.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Levantamiento inicial de capacitaciones ambientales y gestión de documentos', start: '2026-07-09', end: '2026-07-09', users: [REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Levantamiento · Ideación, diseño de flujos, presentaciones al cliente y correcciones del diseño', start: '2026-08-06', end: '2026-08-20', users: [REAL.userAlexis, REAL.userEduardo] },
      { team: REAL.teamDev, name: 'Levantamiento · Levantamiento, diseño y revisión del flujo con GF (PM)', start: '2026-08-05', end: '2026-08-21', users: [REAL.userAnaSoto] },
      { team: REAL.teamDev, name: 'Levantamiento · Inicio técnico del módulo en paralelo al diseño', start: '2026-08-14', end: '2026-08-28', users: [REAL.userNicolas] },
      { team: REAL.teamRpa, name: 'Levantamiento · Seguimiento y entrega de capacitaciones', start: '2026-08-10', end: '2026-08-20', users: [REAL.userJoseAponte] },
      { team: REAL.teamDev, name: 'Levantamiento · Seguimiento, reuniones con cliente y revisión de aprobación del diseño', start: '2026-08-06', end: '2026-08-28', users: [REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción del módulo con los cambios solicitados', start: '2026-08-31', end: '2026-09-29', users: [REAL.userNicolas] },
      { team: REAL.teamUx, name: 'Desarrollo · Diseño de las correcciones del módulo', start: '2026-08-31', end: '2026-08-31', users: [REAL.userAlexis] },
      { team: REAL.teamRpa, name: 'Desarrollo · Seguimiento', start: '2026-08-31', end: '2026-09-08', users: [REAL.userJoseAponte] },
      { team: REAL.teamQa, name: 'Desarrollo · Reunión inicial, diseño y ejecución del test plan (pruebas internas)', start: '2026-09-28', end: '2026-10-16', users: [REAL.userConstanza] },
      { team: REAL.teamDev, name: 'Desarrollo · Traspaso, roles de prueba, corrección de bugs y correcciones QA', start: '2026-10-02', end: '2026-10-15', users: [REAL.userMarco] },
      { team: REAL.teamDev, name: 'Desarrollo · Seguimiento, revisión con QA y revisión con Elisa', start: '2026-08-31', end: '2026-10-15', users: [REAL.userSolmary] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entregas: la propuesta de diseño (5 iteraciones con observaciones hasta la aprobación de Elisa del
    //    08/10) y la entrega a GF para pruebas de usuario (19/10; validada por la líder, pendiente del cliente).
    const DISENO = 'Propuesta de diseño del módulo';
    const ENTREGA_GF = 'Entrega a Gold Fields para pruebas de usuario';
    await tx.insert(projectModuleDeliveries).values([
      {
        id: ID.deliveryDiseno,
        moduleId: ID.module,
        teamId: REAL.teamUx,
        name: DISENO,
        description:
          '1ra entrega a Catalina (10/08), revisión con Marjorie (13/08, piden agregar charlas), 3ra entrega a Marjorie (17/08), revisión de ajustes con Francisco Báez sin observaciones (20/08) y revisión para aprobación por Marjorie (28/08, el cliente solicita más cosas). Elisa aprobó el diseño el 08/10.',
        assigneeUserId: REAL.userAlexis,
        estimatedDate: d('2026-10-08'),
        status: 'approved',
        createdAt: at('2026-08-05'),
        updatedAt: at('2026-10-08', 5),
      },
      {
        id: ID.deliveryEntregaGf,
        moduleId: ID.module,
        teamId: REAL.teamDev,
        name: ENTREGA_GF,
        description: 'Módulo entregado a GF el lunes 19/10 para iniciar las pruebas de usuario (planificada en el Gantt para el 08/10). Validada por la líder; pendiente de confirmación del cliente.',
        assigneeUserId: REAL.userMarco,
        estimatedDate: d('2026-10-19'),
        status: 'approved',
        createdAt: at('2026-08-31'),
        updatedAt: at('2026-10-19', 5),
      },
    ]);

    // 6. Tareas: HH estimadas = peso (ver cabecera). 92,7 + 123,6 + 15,45 = 231,75 HH (30:40:5), que con las
    //    2 entregas (cada una pesa el promedio de las 3 tareas: 77,25) suman 386,25 = 75% de 515.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '92.70', start: '2026-07-09', date: '2026-08-28' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '123.60', start: '2026-08-31', date: '2026-10-16' },
      { id: ID.taskPruebasLogrado, team: REAL.teamDev, name: 'Pruebas G.F.: avance logrado (5 de 25%)', scope: 'revision_cliente', hours: '15.45', start: '2026-10-19', date: '2026-10-22' },
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
        status: 'done' as const,
        scope: task.scope,
        completedAt: at(task.date, 5),
        createdAt: at(task.start),
        updatedAt: at(task.date, 5),
      })),
    );

    // 7. Bitácora: Hito 0, etapas, entregas y tareas (mismos textos que la API), hitos, incidentes e
    //    historial semanal del Panel.
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDiseno = { moduleId: ID.module, deliveryId: ID.deliveryDiseno };
    const onEntregaGf = { moduleId: ID.module, deliveryId: ID.deliveryEntregaGf };
    const panels: [string, number, number, string][] = [
      ['2026-07-20', 0, 0, 'Sin lámina de detalle.'],
      ['2026-07-27', 10, 10, 'Sin lámina de detalle.'],
      ['2026-07-31', 10, 10, 'Sin lámina de detalle.'],
      ['2026-08-07', 10, 24, 'Corrigiendo los cambios de la primera reunión del levantamiento detallado; entrega el lunes 10/08.'],
      ['2026-08-14', 10, 25, '10/08 reunión con Catalina y 13/08 con Marjorie, con observaciones. Piden agregar las charlas. Entrega el 17/08.'],
      ['2026-08-21', 25, 25, '17/08 observaciones de Marjorie; 20/08 revisión con Francisco Báez sin observaciones. Espera aprobación de Marjorie, Catalina y Elisa.'],
      ['2026-08-28', 25, 25, '28/08 se revisa para aprobación por Marjorie.'],
      ['2026-09-04', 30, 40, 'Falta la revisión con Elisa. Se hacen los cambios solicitados, algunos impactan lo levantado.'],
      ['2026-09-11', 35, 50, 'Falta la revisión con Elisa. Se hacen los cambios solicitados.'],
      ['2026-09-25', 50, 55, 'Se espera aprobación de Elisa. Se desarrolla con los últimos cambios de Catalina y Marjorie.'],
      ['2026-10-02', 60, 60, 'Se espera aprobación de Elisa. En pruebas internas.'],
      ['2026-10-09', 68, 68, 'Elisa aprobó el 08/10. En pruebas internas.'],
      ['2026-10-16', 68, 68, 'Se entregará el lunes a Gold Fields para iniciar las pruebas. (La lámina de detalle dice 69/69.)'],
      ['2026-10-23', 70, 70, 'Fases 70% en el Panel de Control. La Presentación AurelIA 10-26 (23/10) muestra 75% y "En pruebas por G.F.": avance confirmado.'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-07-09', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-08-28', 30, S, 'Etapa Levantamiento · peso 30% · 09/07–28/08 · 156,75 HH reales · avance 100%. Cierra con el término de la propuesta de diseño (Gantt); la aprobación de Elisa llegó el 08/10.', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-16', 30, S, 'Etapa Desarrollo · peso 40% · 31/08–16/10 · 185,75 HH reales · avance 100%. Termina con el fin de las pruebas internas de QA (16/10).', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-19', 30, S, 'Etapa Pruebas G.F. · peso 25% · desde 19/10 · sin horas aún · avance 20% (5 de 25, según la Presentación AurelIA 10-26). Módulo entregado a GF para pruebas de usuario.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso', status: 'activo', ...inModule }),
      log('2026-10-19', 31, S, 'Etapa Marcha blanca · peso 5% (columna "Aprobado" del Panel) · sin iniciar. Comienza con la aprobación de GF.', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Propuesta de diseño: 5 iteraciones con observaciones hasta la aprobación de Elisa.
      log('2026-08-05', 0, S, `Nueva entrega "${DISENO}" agregada ${inPhase}, estimada para ${fmt('2026-08-10')}.`, onDiseno),
      log('2026-08-10', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-08-10', '2026-08-10')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-08-10', 1, S, `Entrega "${DISENO}" rechazada ${inPhase}: 1ra entrega a Catalina: observaciones al diseño (cambios del levantamiento detallado).`, onDiseno),
      log('2026-08-10', 2, S, `Entrega "${DISENO}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-08-10')} a ${fmt('2026-08-13')}.`, onDiseno),
      log('2026-08-13', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-08-13', '2026-08-13')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-08-13', 1, S, `Entrega "${DISENO}" rechazada ${inPhase}: Revisión con Marjorie del programa anual de capacitaciones y su carga: piden agregar charlas.`, onDiseno),
      log('2026-08-13', 2, S, `Entrega "${DISENO}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-08-13')} a ${fmt('2026-08-17')}.`, onDiseno),
      log('2026-08-17', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-08-17', '2026-08-17')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-08-17', 1, S, `Entrega "${DISENO}" rechazada ${inPhase}: 3ra entrega a Marjorie: observaciones a la carga del programa para contratistas y al dashboard.`, onDiseno),
      log('2026-08-17', 2, S, `Entrega "${DISENO}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-08-17')} a ${fmt('2026-08-20')}.`, onDiseno),
      log('2026-08-20', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-08-20', '2026-08-20')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-08-28', 1, S, `Entrega "${DISENO}" rechazada ${inPhase}: Revisión para aprobación por Marjorie (término de la propuesta de diseño): el cliente solicita más cosas.`, onDiseno),
      log('2026-08-28', 2, S, `Entrega "${DISENO}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-08-20')} a ${fmt('2026-10-08')}.`, onDiseno),
      log('2026-10-08', 0, REAL.userAlexis, `Entrega "${DISENO}" marcada como terminada ${inPhase}, ${deadline('2026-10-08', '2026-10-08')}; queda pendiente de aprobación.`, onDiseno),
      log('2026-10-08', 5, S, `Entrega "${DISENO}" aprobada ${inPhase}, ${deadline('2026-10-08', '2026-10-08')}.`, onDiseno),

      // Entrega a GF para pruebas de usuario.
      log('2026-08-31', 0, S, `Nueva entrega "${ENTREGA_GF}" agregada ${inPhase}, estimada para ${fmt('2026-10-08')}.`, onEntregaGf),
      log('2026-10-09', 1, S, `Entrega "${ENTREGA_GF}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-10-08')} a ${fmt('2026-10-19')}.`, onEntregaGf),
      log('2026-10-19', 0, REAL.userMarco, `Entrega "${ENTREGA_GF}" marcada como terminada ${inPhase}, ${deadline('2026-10-19', '2026-10-19')}; queda pendiente de aprobación.`, onEntregaGf),
      log('2026-10-19', 5, S, `Entrega "${ENTREGA_GF}" aprobada ${inPhase}, ${deadline('2026-10-19', '2026-10-19')}.`, onEntregaGf),

      // Tareas de etapa.
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        return [
          log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask),
          log(task.date, 6, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.date)}.`, onTask),
        ];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-08-18', 40, S, 'Proyectos Goldfields 18-08: HH 515, término 09/10/2026, avance real 28%.', { type: 'observacion', title: 'Avance Capacitaciones ambientales · Proyectos Goldfields 18-08-2026', status: null, ...inModule }),
      log('2026-08-31', 40, S, 'Inicio de desarrollo (Gantt 28 Sept). Nicolás ya venía con el inicio técnico del módulo desde el 14/08, en paralelo al diseño.', { type: 'hito', title: 'Inicio de desarrollo', status: 'cumplido', ...inModule }),
      log('2026-10-08', 40, S, 'Elisa (aprobadora GF) aprueba el diseño del módulo (OK cliente).', { type: 'hito', title: 'Elisa aprueba el diseño', status: 'cumplido', ...inModule }),
      log('2026-10-16', 40, S, 'Fin de la ejecución del test plan de pruebas internas (OK QA; fecha deducida del último registro de QA).', { type: 'hito', title: 'OK QA: fin de las pruebas internas', status: 'cumplido', ...inModule }),
      log('2026-10-16', 41, S, 'Aprobación de Gold Fields comprometida para la fecha de fin (16/10; original 09/10): vencida. Las pruebas de usuario recién se entregaron el 19/10.', { type: 'compromiso', title: 'Aprobación Gold Fields (fecha de fin)', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-14', 10, S, 'El cliente pide agregar charlas (14/08) y en la revisión del 28/08 no aprueba el diseño y solicita más cosas; los cambios impactan lo ya levantado (04/09).\nTipo: Cambio de alcance · Origen: Externo · Severidad: Media · Cerrado: 08/10.', { type: 'incidente', title: 'INC-01 · Cambios del cliente sobre el diseño', status: 'resuelto', ...inModule }),
      log('2026-08-28', 10, S, 'Espera de la aprobación del diseño por Elisa. Se desarrolló en paralelo con los últimos cambios de Catalina y Marjorie.\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Alta · Cerrado: 08/10 · Relacionado: INC-01.', { type: 'incidente', title: 'INC-02 · Espera de la aprobación de Elisa', status: 'resuelto', ...inModule }),
      log('2026-10-17', 10, S, 'Aprobación de GF de la fecha de fin (16/10) vencida sin OK de Gold Fields. Pruebas de usuario recién entregadas el 19/10.\nTipo: Atraso en entrega (automático) · Severidad: Media · Relacionado: INC-02.', { type: 'incidente', title: 'INC-03 · Atraso en la aprobación de GF', status: 'abierto', ...inModule }),

      // Historial semanal de avance (tabla "Proyectos" del Panel).
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

/** Borra el clon "AurelIA - Capacitaciones ambientales carga" con sus horas copiadas. */
export async function deleteCapacitacionesAmbientalesPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
