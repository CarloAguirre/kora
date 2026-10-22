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
 * Carga de la ficha de Leslie `AurelIA-Sustancias-peligrosas-proyecto-kora.xlsx` (corte 22/10/2026)
 * en el proyecto REAL "AurelIA - Sustancias peligrosas" (`legacy_id = 207`, del sync de la v1 — se
 * resuelve por `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el
 * clon "AurelIA - Sustancias peligrosas carga" con una COPIA de las horas; `real` aplica sobre el
 * proyecto real (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Sustancias peligrosas", 1.359 HH, 07/08–26/10) que recorre las etapas del Panel de
 * Control (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`); etapa de avance del proyecto:
 * `testing` (la ficha recomienda cambiar "En desarrollo" por Pruebas desde la entrega a GF del 15/10).
 * Cada tramo lleva su etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del
 * Panel quedan en la bitácora.
 *
 * Avance: 75% real / 75% esperado, el de la Presentación AurelIA 23/10 (fuente oficial; corrección del
 * 22/10 sobre la ficha v2, que dejaba el real en 70%) — Levantamiento y Desarrollo al 100%, Pruebas G.F.
 * al 20% (5 de 25). Ítems con peso (HH estimadas = peso, sin colaborador asignado → no generan Forecast):
 * las tareas "de etapa" de Levantamiento y Desarrollo, la entrega del módulo a GF del 15/10 (validada por
 * la líder, pendiente de confirmación de GF; pesa el promedio de las tareas — ver `project-progress.ts`),
 * el avance logrado de Pruebas G.F. (5 de 25, aprobado) y la "Aprobación Gold Fields" del 26/10,
 * pendiente, con el 20% restante de Pruebas. Hoy: 75/75; si pasa el 26/10 sin aprobación, Kora muestra
 * el atraso (esperado 95%), como con cualquier hito vencido.
 * Marcha blanca (5%) sin ítems. Los demás hitos (todos pasados) van a la bitácora.
 *
 * Equipos como están en Kora (incluye IA con HH asignadas, aunque no registra horas en este módulo).
 * Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-sustancias-peligrosas <preview|real|cleanup>`.
 */

const LEGACY_ID = 207;
const PREVIEW_NAME = 'AurelIA - Sustancias peligrosas carga';
const PHASE = 'Sustancias peligrosas';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userFrancisca: 'c3aaa952-108a-4510-b61c-1dec8e23f479', // QA
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userLiliana: 'b062dff8-f80f-4d8f-9993-98b5a90c47d4', // UX-UI
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Sustancias peligrosas
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Contrapartes: Daniel y Francisco. */
const CONTACTS = {
  daniel: 'a5b30000-0000-4000-8000-000000000001',
  francisco: 'a5b10000-0000-4000-8000-000000000003',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b4c000' : 'a5b40000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryEntregaGf: id(21),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    taskAprobacionGf: id(33),
    taskPruebasLogrado: id(34),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Reemplazar la solicitud manual de catastros por correo y Excel, pasando de un rol reactivo a uno preventivo mediante la centralización del inventario de sustancias y la detección automática de incompatibilidades normativas.\n\nFuncionalidades: catastro centralizado de bodegas e instalaciones con acceso propio por empresa contratista; motor de compatibilidad automático (Matriz DS 43 / NCh 382) con 3 estados: compatible, verificable, incompatible; panel de alertas filtrable con acuse de recibo; calendario de inspecciones SUSPEL con recordatorios automáticos; dashboard analítico con KPIs de cumplimiento por empresa; notificaciones centralizadas desde la campana de navegación.';

export interface SeedAureliaSustanciasPeligrosasResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaSustanciasPeligrosas(db: Database, target: FichaTarget): Promise<SeedAureliaSustanciasPeligrosasResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Sustancias peligrosas" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Sustancias peligrosas" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.daniel, clientId, name: 'Daniel', position: 'Responsable GF del módulo Controles críticos' },
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
        primaryContactId: CONTACTS.daniel,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-08-07'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 75,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas desde la entrega a GF del 15/10. Fin 26/10.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: '1359.00',
      estimatedStartDate: d('2026-08-07'),
      estimatedEndDate: d('2026-10-26'),
    });

    // 4. Tramos T01–T09 (primer y último día con horas del equipo en la etapa), con su etapa al inicio
    //    del nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamRpa, name: 'Levantamiento · Levantamiento y seguimiento: primera reunión (07/08) y seguimiento (17/08)', start: '2026-08-07', end: '2026-08-17', users: [REAL.userJoseAponte] },
      { team: REAL.teamUx, name: 'Levantamiento · Levantamiento SUSPEL, PRD con historias de usuario, prototipo de catastro, inventario y vistas EECC, presentación a GF (17/08) y diseño en Figma', start: '2026-08-11', end: '2026-08-19', users: [REAL.userLiliana, REAL.userEduardo] },
      { team: REAL.teamDev, name: 'Levantamiento · Reunión de levantamiento del proceso, revisión de la propuesta de diseño con UX y de la propuesta de alto nivel', start: '2026-08-11', end: '2026-08-19', users: [REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Desarrollo · Cierre del diseño SUSPEL con GF (20/08); ajustes en catastro EECC y dashboard; nuevo diseño de dashboard pedido por el cliente (24–29/09)', start: '2026-08-20', end: '2026-09-29', users: [REAL.userLiliana] },
      { team: REAL.teamRpa, name: 'Desarrollo · Entrega del módulo (diseño) a GF (20/08)', start: '2026-08-20', end: '2026-08-20', users: [REAL.userJoseAponte] },
      { team: REAL.teamDev, name: 'Desarrollo · Desarrollo fullstack SUSPEL, migración de datos históricos, control de cambios de Elisa y resolución de casos de QA; seguimiento y estimación', start: '2026-08-20', end: '2026-10-13', users: [REAL.userCarlo, REAL.userSolmary, REAL.userAnaSoto] },
      { team: REAL.teamQa, name: 'Desarrollo · Análisis funcional, test plan y casos de prueba, ejecución, contraste con el catastro de jaulas SUSPEL/RESPEL EECC y re-ejecución de casos', start: '2026-09-21', end: '2026-10-14', users: [REAL.userFrancisca] },
      { team: REAL.teamQa, name: 'Pruebas · Término de la re-ejecución de casos observados (OK QA) previo a la entrega a GF', start: '2026-10-15', end: '2026-10-15', users: [REAL.userFrancisca] },
      { team: REAL.teamDev, name: 'Pruebas · Seguimiento y gestión de la entrega a GF', start: '2026-10-15', end: '2026-10-15', users: [REAL.userSolmary] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entrega del módulo a GF para pruebas (H10, 15/10): planificada para el 01/10 (inicio de pruebas
    //    de usuario), se movió al 15/10 por los cambios de Elisa. Validada por la líder, pendiente de
    //    confirmación de GF.
    const ENTREGA = 'Entrega del módulo a GF para pruebas';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryEntregaGf,
      moduleId: ID.module,
      teamId: REAL.teamDev,
      name: ENTREGA,
      description:
        'Módulo entregado a GF el 15/10 para que lo prueben ("Se entregó el módulo para que puedan probar", Panel 16/10), tras el OK QA de la re-ejecución de casos. Validada por la líder; pendiente de confirmación de GF (sin feedback al corte).',
      assigneeUserId: REAL.userCarlo,
      estimatedDate: d('2026-10-15'),
      status: 'approved',
      createdAt: at('2026-08-20'),
      updatedAt: at('2026-10-15', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Con Pruebas repartida en 67,95 (5%, logrado) + 271,8
    //    (20%, 26/10), Levantamiento + Desarrollo = 693,09 (30:40) hacen que lo aprobado (tareas de etapa,
    //    Pruebas logrado y la entrega, que pesa el promedio de las 4 tareas: 258,21) sume 1.019,25 = 75%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '297.04', start: '2026-08-07', date: '2026-08-19', doneOn: '2026-08-19' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '396.05', start: '2026-08-20', date: '2026-10-14', doneOn: '2026-10-14' },
      { id: ID.taskPruebasLogrado, team: REAL.teamDev, name: 'Pruebas G.F.: avance logrado (5 de 25%)', scope: 'revision_cliente', hours: '67.95', start: '2026-10-15', date: '2026-10-22', doneOn: '2026-10-22' },
      { id: ID.taskAprobacionGf, team: REAL.teamDev, name: 'Aprobación Gold Fields: término de Pruebas G.F. (20 de 25%)', scope: 'revision_cliente', hours: '271.80', start: '2026-10-15', date: '2026-10-26', doneOn: null },
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
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryEntregaGf };
    const panels: [string, number, number, string][] = [
      ['2026-07-20', 0, 0, 'Módulo sin iniciar.'],
      ['2026-07-27', 0, 0, 'Sin iniciar.'],
      ['2026-07-31', 0, 0, 'Sin iniciar (lámina rotulada 27-07).'],
      ['2026-08-07', 0, 0, '07/08 se realizará la primera reunión de levantamiento detallado.'],
      ['2026-08-14', 5, 5, '07/08 primera reunión de levantamiento; se solicita información. 13/08 inicio del diseño de propuesta.'],
      ['2026-08-21', 25, 25, '17/08 revisión de propuesta con observaciones; 20/08 GF conforme con el diseño; se requiere aprobación formal (correo 21/08) y agendar con Elisa.'],
      ['2026-08-28', 33, 33, 'Se comienza el desarrollo; sigue pendiente la aprobación de Elisa.'],
      ['2026-09-04', 45, 50, 'Sigue el desarrollo; agendar reunión con Elisa.'],
      ['2026-09-11', 50, 60, 'Consultas con Daniel por datos históricos; se está cerrando el desarrollo para pasar a pruebas.'],
      ['2026-09-25', 60, 65, 'Se está desarrollando; consultas del histórico por correo; se requiere aprobación de Elisa.'],
      ['2026-10-02', 65, 68, '28/09 revisión con Elisa con cambios, ya realizados y en pruebas internas; se piden HDS históricas.'],
      ['2026-10-09', 68, 68, 'GF: no aplica el envío de HDS histórico; la semana siguiente se entrega el módulo para pruebas.'],
      ['2026-10-16', 70, 70, 'Se entregó el módulo para que puedan probar.'],
      ['2026-10-23', 75, 75, 'Presentación AurelIA 23/10: 75% (fuente oficial del avance; la lámina del módulo en el Panel sigue en 70%).'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-08-07', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-08-19', 30, S, 'Etapa Levantamiento · peso 30% · 07/08–19/08 · 48,25 HH reales · avance 100%. Desde la primera reunión (07/08) hasta el término de la propuesta de diseño (19/08).', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-14', 30, S, 'Etapa Desarrollo · peso 40% · 20/08–14/10 · 211,75 HH reales · avance 100%. El término planificado (18/09) se movió por las aclaraciones de datos históricos y los cambios de Elisa; termina el día previo a la entrega a GF.', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-10-15', 30, S, 'Etapa Pruebas G.F. · peso 25% · 15/10–26/10 · 4,25 HH reales · avance 20% (5 de 25, según la Presentación AurelIA 23/10). Módulo entregado a GF para pruebas, a la espera de feedback.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso', status: 'activo', ...inModule }),
      log('2026-10-15', 31, S, 'Etapa Marcha blanca · peso 5% (en el Panel está sobre "Aprobado") · sin iniciar. Comienza con la aprobación de GF (OK cliente).', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Entrega a GF y tareas.
      log('2026-08-20', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-10-01')}.`, onDelivery),
      log('2026-10-02', 1, S, `Entrega "${ENTREGA}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-10-01')} a ${fmt('2026-10-15')}.`, onDelivery),
      log('2026-10-15', 0, REAL.userCarlo, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-10-15', '2026-10-15')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-10-15', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-10-15', '2026-10-15')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos de la ficha que no son ítems con peso (todos pasados).
      log('2026-08-17', 40, S, 'Presentación del prototipo de diseño a GF: se levantan observaciones.', { type: 'hito', title: 'Presentación del prototipo de diseño a GF (con observaciones)', status: 'rechazado', ...inModule }),
      log('2026-08-19', 40, S, 'Término de la propuesta de diseño (Gantt).', { type: 'hito', title: 'Término de la propuesta de diseño', status: 'cumplido', ...inModule }),
      log('2026-08-20', 40, S, 'Cierre del diseño SUSPEL en reunión con GF: sin más observaciones, el equipo GF queda conforme (OK cliente). Inicio de desarrollo (fullstack desde el 31/08).', { type: 'hito', title: 'Cierre del diseño SUSPEL con GF e inicio de desarrollo', status: 'cumplido', ...inModule }),
      log('2026-09-18', 40, S, 'Término de desarrollo planificado: no se cumplió, GF aún resolvía aclaraciones de datos históricos y luego vinieron los cambios de Elisa.', { type: 'compromiso', title: 'Término de desarrollo (planificado 18/09)', status: 'rechazado', ...inModule }),
      log('2026-09-28', 40, S, 'Revisión del flujo con Elisa y Marjorie: solicitan cambios (HDS en catastro, dashboard v2, notificaciones, nuevo campo HDS histórico).', { type: 'hito', title: 'Revisión del flujo con Elisa y Marjorie (cambios solicitados)', status: 'rechazado', ...inModule }),
      log('2026-10-01', 40, S, 'Inicio de pruebas de usuario planificado (OK QA): vencido, QA seguía ejecutando casos con los cambios. Se movió al 15/10.', { type: 'compromiso', title: 'Inicio de pruebas de usuario (planificado 01/10)', status: 'rechazado', ...inModule }),
      log('2026-10-09', 40, S, 'GF indica que no aplica el envío de HDS histórico: cada usuario (EECC o GF) cargará la HDS al hacer el catastro (1 vez por sustancia). Carlo entrega a QA las correcciones (23 casos pendientes).', { type: 'hito', title: 'GF: no aplica el envío de HDS histórico', status: 'cumplido', ...inModule }),
      log('2026-10-15', 40, S, 'QA termina la re-ejecución de los casos con observaciones (OK QA), previo a la entrega a GF.', { type: 'hito', title: 'OK QA: re-ejecución de casos terminada', status: 'cumplido', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-21', 10, S, 'Se requiere aprobación formal del diseño de Elisa para pasar a desarrollo (correo enviado el 21/08). El desarrollo partió sin esa aprobación; la revisión con Elisa y Marjorie recién se hizo el 28/09.\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Cerrado: 28/09.', { type: 'incidente', title: 'INC-01 · Diseño sin aprobación formal de Elisa', status: 'resuelto', ...inModule }),
      log('2026-09-01', 10, S, 'Figma con un flujo incompleto, detectado al revisar con Carlo y Eduardo; se debe cambiar. Cambios definidos con diseño implementados el 24–25/09.\nTipo: Otro · Origen: Interno · Severidad: Baja · Cerrado: 25/09.', { type: 'incidente', title: 'INC-02 · Figma con flujo incompleto', status: 'resuelto', ...inModule }),
      log('2026-09-07', 10, S, 'Dudas de GF sobre la migración de datos históricos del catastro (documento de consultas y cuestionario final de aclaraciones); impide cerrar el desarrollo. Aclaraciones integradas el 23/09.\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Cerrado: 23/09.', { type: 'incidente', title: 'INC-03 · Dudas de GF sobre la migración de datos históricos', status: 'resuelto', ...inModule }),
      log('2026-09-28', 10, S, 'Cambios solicitados en la revisión con Elisa del 28/09: HDS en catastro, dashboard v2, notificaciones y nuevo campo de HDS histórico. Implementados al 01/10 y luego validados por QA.\nTipo: Cambio de alcance · Origen: Externo · Severidad: Media · Cerrado: 02/10 · Relacionado: INC-01.', { type: 'incidente', title: 'INC-04 · Cambios solicitados por Elisa', status: 'resuelto', ...inModule }),
      log('2026-10-02', 10, S, 'Se pide a GF enviar las HDS históricas para el nuevo campo; GF responde que no aplica (se cargan en cada catastro).\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Baja · Cerrado: 09/10 · Relacionado: INC-04.', { type: 'incidente', title: 'INC-05 · HDS históricas', status: 'resuelto', ...inModule }),
      log('2026-10-02', 11, S, 'Inicio de pruebas de usuario (01/10) vencido. Se cierra con la entrega a GF del 15/10.\nTipo: Atraso en entrega · Origen: Externo · Severidad: Media · Cerrado: 15/10 · Relacionado: INC-04.', { type: 'incidente', title: 'INC-06 · Atraso del inicio de pruebas de usuario', status: 'resuelto', ...inModule }),
      log('2026-10-15', 10, S, 'Módulo entregado a GF para pruebas; sin feedback al corte (sin horas registradas desde el 15/10).\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media.', { type: 'incidente', title: 'INC-07 · Espera de feedback de GF sobre la entrega', status: 'abierto', ...inModule }),

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

/** Borra el clon "AurelIA - Sustancias peligrosas carga" con sus horas copiadas. */
export async function deleteSustanciasPeligrosasPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
