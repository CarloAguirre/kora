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
 * Carga de la ficha de Leslie `AurelIA-Gestion-documental-proyecto-kora.xlsx` (corte 22/10/2026) en
 * el proyecto REAL "AurelIA - Gestión documental" (`legacy_id = 204`, del sync de la v1 — se resuelve
 * por `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Gestión documental carga" con una COPIA de las horas; `real` aplica sobre el proyecto real
 * (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Gestión documental", 364 HH, 09/07–04/09) que recorre las etapas del Panel de Control
 * (30 · 40 · 25 · 5). Etapa de la fase: Pruebas (`production`); etapa de avance del proyecto: `testing`.
 * Cada tramo lleva su etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del
 * Panel quedan en la bitácora.
 *
 * Avance: el Panel del 23/10 dice 85% real / 100% esperado — Levantamiento y Desarrollo al 100%, Pruebas
 * G.F. al 60%; la fecha de fin (04/09) venció, así que se espera todo. Ítems con peso (HH estimadas =
 * peso, sin colaborador asignado → no generan Forecast): las tareas "de etapa" de Levantamiento y
 * Desarrollo, la aprobación de Elisa del 08/10 (los 15 de 25 logrados de Pruebas), la entrega a GF
 * (validada por la líder; pesa el promedio de las tareas — ver `project-progress.ts`) y la "Aprobación
 * Gold Fields" de la fecha de término (04/09, pendiente y vencida) con el 15% que falta: 10% de Pruebas
 * más el 5% de la columna "Aprobado" del Panel (Marcha blanca). Todo vencido → esperado 100%.
 *
 * Equipos como están en Kora. Estado: Activo (en espera del feedback, sin stop de reloj).
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-gestion-documental <preview|real|cleanup>`.
 */

const LEGACY_ID = 204;
const PREVIEW_NAME = 'AurelIA - Gestión documental carga';
const PHASE = 'Gestión documental';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userLiliana: 'b062dff8-f80f-4d8f-9993-98b5a90c47d4', // UX-UI
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Gestión documental
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b5c000' : 'a5b50000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryEntregaGf: id(21),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    taskElisa: id(33),
    taskAprobacionGf: id(34),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Centralizar la documentación ambiental vigente (hoy dispersa en carpetas y correos) en un repositorio único, con flujo formal de aprobación y firma digital.\n\nFuncionalidades: biblioteca en 7 categorías (Política, Estándares, Procedimientos, Planes, Protocolos, Instructivos, Programas); acceso diferenciado (gestión / solo lectura interno y EECC); publicación directa o flujo de firma secuencial Coordinador → Superintendente → Gerente; gestión de rechazos con reinicio del flujo; alertas de vencimiento anual y notificaciones por turno de firma; buscador, historial de versiones y audit log.';

export interface SeedAureliaGestionDocumentalResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaGestionDocumental(db: Database, target: FichaTarget): Promise<SeedAureliaGestionDocumentalResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Gestión documental" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Gestión documental" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Responsable GF del módulo Inspecciones' },
        { id: CONTACTS.marjorie, clientId, name: 'Marjorie', position: 'Responsable GF del módulo Inspecciones' },
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

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 85%.
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
        actualProgress: 85,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Pruebas (60%). Fin 04/09 vencido por las esperas de feedback del cliente.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: '364.00',
      estimatedStartDate: d('2026-07-09'),
      estimatedEndDate: d('2026-09-04'),
    });

    // 4. Tramos T01–T10 (fechas del registro de horas ajustadas a los hitos), con su etapa al inicio del
    //    nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Revisión de la propuesta, alineamiento UX y definición de firma, gestión y visor con el cliente', start: '2026-07-30', end: '2026-08-06', users: [REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Levantamiento · Diseño en Figma y presentación de la propuesta', start: '2026-08-03', end: '2026-08-05', users: [REAL.userLiliana] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción del módulo: biblioteca documental, backend y frontend del flujo de firmas, visor y firma digital versionada; entrega a QA', start: '2026-08-07', end: '2026-08-14', users: [REAL.userCarlo] },
      { team: REAL.teamDev, name: 'Desarrollo · Seguimiento, estimación de horas y fecha de término; revisión del desarrollo y correo de pruebas al cliente', start: '2026-08-10', end: '2026-08-17', users: [REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Pruebas · Seguimiento de pruebas G.F., lectura y revisión del feedback con Dev y UX', start: '2026-08-24', end: '2026-09-17', users: [REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Pruebas · Corrección de bugs e implementación del feedback G.F.: control de cambios y submódulo de migración de documentación', start: '2026-09-07', end: '2026-09-16', users: [REAL.userCarlo] },
      { team: REAL.teamUx, name: 'Pruebas · Revisión de correcciones y actualización del manual de usuario', start: '2026-09-21', end: '2026-09-22', users: [REAL.userLiliana] },
      { team: REAL.teamDev, name: 'Pruebas · Control de cambios: stepper de carga directa o flujo de firma', start: '2026-09-29', end: '2026-09-29', users: [REAL.userCarlo] },
      { team: REAL.teamDev, name: 'Pruebas · Revisión con el cliente y aprobación de Elisa', start: '2026-10-05', end: '2026-10-08', users: [REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Pruebas · Control de cambios del flujo de firmas: check-box de firmantes y firmantes externos', start: '2026-10-13', end: '2026-10-13', users: [REAL.userCarlo] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entrega a GF — las 3 entregas de la ficha (17/08 rechazada con observaciones, 18/09 con el feedback
    //    incorporado y aprobada por Elisa el 08/10, 14/10 tras el control de cambios del flujo de firmas,
    //    pendiente de confirmación del cliente) son una misma entrega con su historial.
    const ENTREGA = 'Módulo Gestión documental a GF para pruebas';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryEntregaGf,
      moduleId: ID.module,
      teamId: REAL.teamDev,
      name: ENTREGA,
      description:
        '1ra entrega 17/08 (término de desarrollo; GF envió el documento de cambios el 13/09). 2da entrega 18/09 con el feedback incorporado; Elisa aprobó el módulo el 08/10. 3ra entrega 14/10 tras el control de cambios del flujo de firmas: validada por la líder, en espera del feedback de GF.',
      assigneeUserId: REAL.userCarlo,
      estimatedDate: d('2026-09-18'),
      status: 'approved',
      createdAt: at('2026-08-07'),
      updatedAt: at('2026-10-08', 5),
    });

    // 6. Tareas: HH estimadas = peso (ver cabecera). Aprobación GF fija en 54,6 (15% de 364); Levantamiento
    //    + Desarrollo + Elisa = 236,6 (30:40:15) hacen que lo aprobado (con la entrega, que pesa el promedio
    //    de las 4 tareas: 72,8) sume 309,4 = 85%, y todo (vencido) 364 = 100%.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '83.51', start: '2026-07-09', date: '2026-08-06', doneOn: '2026-08-06' },
      { id: ID.taskEtapaDesarrollo, team: null, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '111.34', start: '2026-08-07', date: '2026-08-17', doneOn: '2026-08-17' },
      { id: ID.taskElisa, team: REAL.teamDev, name: 'Elisa aprueba el módulo (OK cliente · Pruebas G.F. 15 de 25%)', scope: 'revision_cliente', hours: '41.75', start: '2026-09-18', date: '2026-10-08', doneOn: '2026-10-08' },
      { id: ID.taskAprobacionGf, team: REAL.teamDev, name: 'Aprobación Gold Fields en la fecha de término (10% de Pruebas + 5% Aprobado)', scope: 'revision_cliente', hours: '54.60', start: '2026-08-17', date: '2026-09-04', doneOn: null },
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
    //    historial semanal del Panel.
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryEntregaGf };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 8, 8, '(Sin lámina de detalle.)'],
      ['2026-07-31', 8, 8, '(Sin lámina de detalle.)'],
      ['2026-08-07', 30, 35, 'Se cerró el día 06-08-26 y comenzó el desarrollo del módulo. Queda pendiente estimar la fecha de finalización.'],
      ['2026-08-14', 35, 45, 'Kabeli está en desarrollo.'],
      ['2026-08-21', 35, 45, 'Se debe agendar reunión con Elisa para revisar diseño. Kabeli está en desarrollo.'],
      ['2026-08-28', 35, 45, 'Se entrega para pruebas de Gold Fields.'],
      ['2026-09-04', 45, 70, 'En espera de feedback de Goldfields, por eso no aumenta el porcentaje de avance.'],
      ['2026-09-11', 45, 70, 'En espera de feedback de Goldfields, por eso no aumenta el porcentaje de avance.'],
      ['2026-09-25', 100, 85, 'Se entregó de nuevo con el feedback realizado por Gold Fields. Se espera revisarlo con Elisa para que se apruebe.'],
      ['2026-10-02', 100, 85, 'Se entregó de nuevo con el feedback realizado por Gold Fields. Se espera revisarlo con Elisa para que se apruebe.'],
      ['2026-10-09', 100, 85, 'Aprobado por Elisa 08-10-26. Ya pueden ir revisando el módulo.'],
      ['2026-10-16', 100, 85, 'En espera del feedback.'],
      ['2026-10-23', 100, 85, 'En espera del feedback (la lámina conserva el título 16-10-2026).'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-07-09', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-08-06', 30, S, 'Etapa Levantamiento · peso 30% · 09/07–06/08 · 29,25 HH reales · avance 100%. Se cerró el 06/08 con la propuesta final revisada con el cliente (05/08).', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-08-17', 30, S, 'Etapa Desarrollo · peso 40% · 07/08–17/08 · 40 HH reales · avance 100%. El 14/08 Carlo finaliza el módulo y lo entrega a QA; el 17/08 se envía el correo de pruebas al cliente.', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-08-18', 30, S, 'Etapa Pruebas G.F. · peso 25% · 18/08–04/09 (planificado) · 42,25 HH reales · avance 60%. Sigue en curso: espera del feedback tras la entrega del 14/10.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso (60%)', status: 'activo', ...inModule }),
      log('2026-08-18', 31, S, 'Etapa Marcha blanca · peso 5% (columna "Aprobado" del Panel; Kora no tiene esa etapa) · sin iniciar. El paso a producción del Gantt (19/10) está marcado "tbd".', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Entrega a GF: rechazada con observaciones, reentregada, aprobada por Elisa.
      log('2026-08-07', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-08-17')}.`, onDelivery),
      log('2026-08-17', 0, REAL.userCarlo, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-08-17', '2026-08-17')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-09-13', 0, S, `Entrega "${ENTREGA}" rechazada ${inPhase}: Feedback de G.F.: documento de cambios y solicitudes.`, onDelivery),
      log('2026-09-13', 1, S, `Entrega "${ENTREGA}" ${inPhase}: fecha estimada cambiada de ${fmt('2026-08-17')} a ${fmt('2026-09-18')}.`, onDelivery),
      log('2026-09-18', 0, REAL.userCarlo, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-09-18', '2026-09-18')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-10-08', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-09-18', '2026-10-08')}.`, onDelivery),

      // Tareas: creación y, si se cumplió, aprobación directa de la líder (no tienen colaborador asignado).
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 6, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos y observaciones de la ficha que no son ítems con peso.
      log('2026-08-05', 40, S, 'Cierre del levantamiento: propuesta final revisada con el cliente (05/08) y comienzo del desarrollo (OK cliente).', { type: 'hito', title: 'Cierre del levantamiento con el cliente', status: 'cumplido', ...inModule }),
      log('2026-08-24', 40, S, 'Problema interno: "se perdieron cosas por un paso a QA" (registro de Solmary). Sin fecha de resolución; queda como observación.', { type: 'observacion', title: 'Pérdida de cambios en un paso a QA', status: null, ...inModule }),
      log('2026-09-13', 40, S, 'Feedback de G.F. sobre la 1ra entrega: documento de cambios y solicitudes. Generó "control de cambios" y un submódulo de migración de documentación (14–15/09) — posible cambio de alcance, por confirmar con Solmary.', { type: 'hito', title: 'Feedback de G.F.: documento de cambios', status: 'cumplido', ...inModule }),
      log('2026-10-14', 40, S, '3ra entrega a GF tras el control de cambios del flujo de firmas (13/10): check-box de firmantes y firmantes externos. Pendiente de confirmación del cliente ("En espera del feedback").', { type: 'hito', title: '3ra entrega tras control de cambios del flujo de firmas', status: 'activo', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/responsable/relación: van en el texto.
      log('2026-08-17', 10, S, 'Espera del feedback de G.F. tras la 1ra entrega; el Panel 04/09 y 11/09 indica que por eso no aumenta el avance.\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Responsable: Gold Fields (Catalina / Marjorie) · Cerrado: 13/09 (27 días).', { type: 'incidente', title: 'INC-01 · Espera del feedback de G.F. (1ra entrega)', status: 'resuelto', ...inModule }),
      log('2026-09-05', 10, S, 'La aprobación de Gold Fields de la fecha de término (04/09) venció. Atraso atribuible a las esperas de feedback del cliente.\nTipo: Atraso en entrega · Origen: Externo · Severidad: Alta · Responsable: Solmary Castro · Relacionado: INC-01 / INC-03.', { type: 'incidente', title: 'INC-04 · Atraso en la aprobación de GF', status: 'abierto', ...inModule }),
      log('2026-09-25', 10, S, 'Espera de la revisión y aprobación de Elisa tras la 2da entrega (Panel 25/09 y 02/10).\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Responsable: Elisa · Cerrado: 08/10 (13 días) · Relacionado: INC-01.', { type: 'incidente', title: 'INC-02 · Espera de la aprobación de Elisa (2da entrega)', status: 'resuelto', ...inModule }),
      log('2026-10-14', 10, S, 'Espera del feedback de la 3ra entrega (Panel 16/10 y 23/10 "En espera del feedback").\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Responsable: Gold Fields (Catalina / Marjorie) · Relacionado: INC-02.', { type: 'incidente', title: 'INC-03 · Espera del feedback de la 3ra entrega', status: 'abierto', ...inModule }),

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

/** Borra el clon "AurelIA - Gestión documental carga" con sus horas copiadas. */
export async function deleteGestionDocumentalPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
