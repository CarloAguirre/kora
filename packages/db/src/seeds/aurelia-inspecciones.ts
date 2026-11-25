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
 * Carga de la ficha de Leslie `AurelIA-Inspecciones-proyecto-kora.xlsx` (corte 22/10/2026) en el
 * proyecto REAL "AurelIA - Inspecciones" (`legacy_id = 48`, del sync de la v1 — se resuelve por
 * `legacyId`, nunca por un uuid fijo). Mismos destinos que `aurelia-spr.ts`: `preview` crea/recrea el
 * clon "AurelIA - Inspecciones carga" con una COPIA de las horas; `real` aplica sobre el proyecto real
 * (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * Como la ficha v2 de SPR: UNA fase ("Inspecciones", 1.359 HH) que recorre las etapas del Panel de
 * Control (Levantamiento detallado 30 · Desarrollo 40 · Pruebas G.F. 25 · Marcha blanca 5). Etapa de la
 * fase: Pruebas (`production`, etiquetada "Pruebas" en Kora); etapa de avance del proyecto: `testing`.
 * Cada tramo lleva su etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del
 * Panel quedan en la bitácora.
 *
 * Avance: el Panel del 23/10 dice 70% real / 70% esperado — Levantamiento y Desarrollo al 100%; Pruebas
 * en 0% (congelada: Gold Fields detuvo el proyecto el 26/08). Para que Kora muestre lo mismo, los ítems
 * con peso son solo los de las etapas cerradas: dos tareas "de etapa" (HH estimadas = peso, sin
 * colaborador asignado → no generan Forecast) y la entrega de desarrollo del 07/08 (aprobada; pesa el
 * promedio de las tareas — ver `project-progress.ts`). Pruebas y Marcha blanca (30% = 407,7 HH) quedan sin
 * ítems: cuentan en la base pero ni en el real ni en el esperado. Por eso los hitos de Pruebas (entregas
 * pendientes de feedback, aprobación de GF vencida) van a la bitácora y no como tareas/entregas: con
 * fecha vencida sumarían al esperado (Kora esperaría 100%) aunque el Panel lo congeló en 70%.
 *
 * Equipos como están en Kora (incluye IA: 247 HH en este módulo). Estado del proyecto: Activo, como el
 * formulario; la detención por GF es el incidente INC-02 (abierto).
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-inspecciones <preview|real|cleanup>`.
 */

const LEGACY_ID = 48;
const PREVIEW_NAME = 'AurelIA - Inspecciones carga';
const PHASE = 'Inspecciones';

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
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI
  userFrancisca: 'c3aaa952-108a-4510-b61c-1dec8e23f479', // QA
  userFranz: 'bb0d50a1-8a79-4044-9c58-e72e21f91b24', // IA
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userNatalia: '91083daf-f6c0-4ba0-9a12-61ce0b3acb8a', // IA (líder)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Inspecciones
  userViktoriia: '1f873704-ada9-4eea-983b-aad7e5da8985', // IA
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — compartidos por ambos destinos. Elisa ya la crea la ficha de SPR (mismo id). */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
  francisco: 'a5b10000-0000-4000-8000-000000000003',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b1c000' : 'a5b10000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryDesarrollo: id(21),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Digitalizar el proceso de inspecciones ambientales en terreno con un flujo trazable, evidencia fotográfica y seguimiento de hallazgos hasta su cierre.\n\nFuncionalidades: dashboard con KPIs, tendencias y tabla de hallazgos abiertos/cerrados; checklist digital en terreno; registro y calificación de hallazgos con severidad; historial y trazabilidad de cada inspección; administración de listas maestras; app mobile y agente de IA.';

export interface SeedAureliaInspeccionesResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaInspecciones(db: Database, target: FichaTarget): Promise<SeedAureliaInspeccionesResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Inspecciones" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Inspecciones" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente — solo lo que trae la ficha (sin apellido, correo ni teléfono).
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

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 70%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'testing',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-06-03'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 70,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única. Fin 31/08 vencido: el proyecto está detenido por GF desde el 26/08.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'production',
      estimatedHours: '1359.00',
      estimatedStartDate: d('2026-06-03'),
      estimatedEndDate: d('2026-08-31'),
    });

    // 4. Tramos T01–T13 (primer y último registro del equipo en cada etapa), con su etapa al inicio del
    //    nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Levantamiento con GF, PRD, diagramas AS-IS/TO-BE, estimación y kickoff', start: '2026-06-01', end: '2026-06-15', users: [REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Levantamiento · Levantamiento UX, flujo de inspecciones, documentación y correcciones del diseño', start: '2026-06-15', end: '2026-06-19', users: [REAL.userEduardo, REAL.userAlexis] },
      { team: REAL.teamIa, name: 'Levantamiento · EDA (análisis exploratorio de datos)', start: '2026-06-17', end: '2026-06-23', users: [REAL.userViktoriia] },
      { team: REAL.teamDev, name: 'Desarrollo · Construcción del módulo web y app mobile (frontend y backend)', start: '2026-06-24', end: '2026-08-06', users: [REAL.userCarlo, REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Desarrollo · Ajustes de diseño previos a la entrega', start: '2026-08-05', end: '2026-08-05', users: [REAL.userAlexis] },
      { team: REAL.teamQa, name: 'Desarrollo · Diseño de casos de prueba (test plan)', start: '2026-07-22', end: '2026-08-06', users: [REAL.userFrancisca] },
      { team: REAL.teamRpa, name: 'Desarrollo · Seguimiento', start: '2026-07-28', end: '2026-07-28', users: [REAL.userJoseAponte] },
      { team: REAL.teamIa, name: 'Desarrollo · EDA y agente AurelIA Inspecciones; RAG', start: '2026-06-24', end: '2026-08-06', users: [REAL.userViktoriia, REAL.userFranz] },
      { team: REAL.teamDev, name: 'Pruebas · Corrección de bugs QA, feedback GF y rediseños solicitados por GF', start: '2026-08-07', end: '2026-08-28', users: [REAL.userCarlo, REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Pruebas · Rediseños solicitados por GF', start: '2026-08-21', end: '2026-08-24', users: [REAL.userAlexis] },
      { team: REAL.teamQa, name: 'Pruebas · Ejecución de pruebas desktop y mobile con roles', start: '2026-08-07', end: '2026-08-28', users: [REAL.userFrancisca] },
      { team: REAL.teamRpa, name: 'Pruebas · Seguimiento de reportes y reunión de definición', start: '2026-08-14', end: '2026-08-19', users: [REAL.userJoseAponte] },
      { team: REAL.teamIa, name: 'Pruebas · RAG online/offline con pgvector, instalación en celular y revisiones; en septiembre: EDA, conexión a BD, Azure y migración', start: '2026-08-07', end: '2026-09-30', users: [REAL.userFranz, REAL.userViktoriia, REAL.userNatalia] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Entrega de desarrollo (H01, 07/08): cierra la etapa Desarrollo e inicia Pruebas.
    const ENTREGA = 'Entrega de desarrollo a Gold Fields para pruebas';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryDesarrollo,
      moduleId: ID.module,
      teamId: REAL.teamDev,
      name: ENTREGA,
      description: 'Módulo web y app mobile entregados a Gold Fields el 07/08 para pruebas (cierra la etapa Desarrollo).',
      assigneeUserId: REAL.userCarlo,
      estimatedDate: d('2026-08-07'),
      status: 'approved',
      createdAt: at('2026-06-24'),
      updatedAt: at('2026-08-07', 5),
    });

    // 6. Tareas "de etapa": HH estimadas = peso (ver cabecera). 271,8 + 362,4 = 634,2 HH, que con la
    //    entrega (promedio: 317,1) suman 951,3 = 70% de 1.359.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '271.80', start: '2026-06-03', date: '2026-06-23' },
      { id: ID.taskEtapaDesarrollo, name: 'Etapa Desarrollo (peso 40%)', scope: 'desarrollo', hours: '362.40', start: '2026-06-24', date: '2026-08-06' },
    ] as const;
    await tx.insert(projectModuleTasks).values(
      tasks.map((task) => ({
        id: task.id,
        moduleId: ID.module,
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

    // 7. Bitácora: Hito 0, etapas, entrega y tareas (mismos textos que la API), hitos de Pruebas,
    //    incidentes e historial semanal del Panel.
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryDesarrollo };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 50, 50, 'Responsable: Solmary / Ana.'],
      ['2026-07-31', 55, 55, ''],
      ['2026-08-07', 60, 60, 'En Pruebas por Kabeli y Gold Fields; 8 checklist modificados y uno nuevo.'],
      ['2026-08-14', 70, 70, 'GF entrega bugs consolidados de ambos turnos.'],
      ['2026-08-21', 70, 70, 'Cambios de GF requieren 7 días; el porcentaje se mantiene por los cambios.'],
      ['2026-08-28', 98, 80, '24/08 nueva versión para probar; 26/08 Elisa detiene el proyecto.'],
      ['2026-09-04', 98, 80, 'Sin cambios.'],
      ['2026-09-11', 98, 80, 'Sin cambios.'],
      ['2026-09-25', 70, 70, 'El Panel vuelve a 70/70 (texto del 21/08 reutilizado).'],
      ['2026-10-02', 70, 70, 'Sin cambios.'],
      ['2026-10-09', 70, 70, 'Se encuentra detenido.'],
      ['2026-10-16', 70, 70, 'Se encuentra detenido.'],
      ['2026-10-23', 70, 70, 'Se encuentra detenido.'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-06-03', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-06-23', 30, S, 'Etapa Levantamiento · peso 30% · 03/06–23/06 · 73,25 HH reales · avance 100%. Incluye 1,5 HH del 01/06 (preparación previa al Hito 0).', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-08-06', 30, S, 'Etapa Desarrollo · peso 40% · 24/06–06/08 · 392 HH reales · avance 100%. Termina con la entrega de desarrollo del 07/08.', { type: 'hito', title: 'Etapa "Desarrollo" finalizada', status: 'cumplido', ...inModule }),
      log('2026-08-07', 30, S, 'Etapa Pruebas G.F. · peso 25% · 07/08–31/08 · 347,25 HH reales · avance 0%. Detenida desde el 26/08; el Panel mantiene su avance en 0% por los cambios de GF.', { type: 'hito', title: 'Etapa "Pruebas G.F." en curso (detenida)', status: 'activo', ...inModule }),
      log('2026-08-07', 31, S, 'Etapa Marcha blanca · peso 5% (en el Panel está sobre "Aprobado") · sin iniciar. Fechas por definir: dependen de que GF reanude el proyecto.', { type: 'compromiso', title: 'Etapa "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Entrega de desarrollo y tareas de etapa.
      log('2026-06-24', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-08-07')}.`, onDelivery),
      log('2026-08-07', 0, REAL.userCarlo, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-08-07', '2026-08-07')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-08-07', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-08-07', '2026-08-07')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        return [
          log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask),
          log(task.date, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.date)}.`, onTask),
        ];
      }),

      // Hitos de la etapa Pruebas (no son ítems con peso: el Panel congeló Pruebas en 0%).
      log('2026-08-07', 40, S, 'Gold Fields envió su feedback sobre la entrega de desarrollo: con observaciones.', { type: 'hito', title: 'Feedback de Gold Fields', status: 'cumplido', ...inModule }),
      log('2026-08-14', 40, S, 'Gold Fields entrega los bugs consolidados de las pruebas de ambos turnos: con observaciones.', { type: 'hito', title: 'GF entrega bugs consolidados', status: 'cumplido', ...inModule }),
      log('2026-08-17', 40, S, 'Kabeli realizó los cambios solicitados (corrección de bugs de QA y del feedback de GF).', { type: 'hito', title: 'Cambios realizados por Kabeli (corrección de bugs)', status: 'cumplido', ...inModule }),
      log('2026-08-21', 40, S, 'Desde el 21/08, todos los cambios de los módulos de AurelIA pasan por la revisión de Elisa (aprobadora GF).', { type: 'observacion', title: 'Cambios de AurelIA pasan por revisión de Elisa', status: null, ...inModule }),
      log('2026-08-24', 40, S, 'Nueva versión web disponible para pruebas, con los rediseños solicitados por GF. Formalizada por correo el 26/08.', { type: 'hito', title: 'Nueva versión web disponible para pruebas', status: 'cumplido', ...inModule }),
      log('2026-08-24', 41, S, 'Kabeli espera el feedback de Gold Fields sobre la versión del 24/08.', { type: 'compromiso', title: 'Feedback de GF sobre la versión del 24/08', status: 'pendiente', ...inModule }),
      log('2026-08-26', 40, S, 'Elisa (aprobadora GF) informa que el proyecto queda detenido.', { type: 'hito', title: 'Elisa detiene el proyecto', status: 'cumplido', ...inModule }),
      log('2026-08-31', 40, S, 'Aprobación de Gold Fields comprometida para la fecha de fin (31/08): vencida, el proyecto sigue detenido por GF.', { type: 'compromiso', title: 'Aprobación Gold Fields (fecha de fin)', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/responsable/relación: van en el texto.
      log('2026-08-19', 10, S, 'GF solicita KPIs distintos y revertir cambios ya aprobados; requiere 7 días entre desarrollo, diseño, QA y líder.\nTipo: Cambio de alcance · Origen: Externo · Cerrado: 24/08 · Relacionado: GF pide KPIs distintos (19/08) / nueva versión (24/08).', { type: 'incidente', title: 'INC-01 · GF pide KPIs distintos y revertir cambios', status: 'resuelto', ...inModule }),
      log('2026-08-19', 11, S, 'Sin acceso a las inspecciones históricas detalladas para entrenar el agente de IA (solicitado 17–19/08). GF advierte que el histórico vendría vacío.\nTipo: Espera de información del cliente · Origen: Externo · Relacionado: INC-02.', { type: 'incidente', title: 'INC-03 · Sin acceso al histórico de inspecciones', status: 'abierto', ...inModule }),
      log('2026-08-26', 10, S, 'Elisa informa que el proyecto queda detenido. Kabeli espera el feedback de la versión del 24/08.\nTipo: Detención del proyecto por el cliente · Origen: Externo.', { type: 'incidente', title: 'INC-02 · Proyecto detenido por Gold Fields', status: 'abierto', ...inModule }),
      log('2026-09-01', 10, S, 'La aprobación de Gold Fields (fecha de fin 31/08) venció. Atraso atribuible a la detención por el cliente.\nTipo: Atraso en entrega · Origen: Externo · Relacionado: INC-02.', { type: 'incidente', title: 'INC-04 · Atraso en la aprobación de GF', status: 'abierto', ...inModule }),

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

/** Borra el clon "AurelIA - Inspecciones carga" con sus horas copiadas. */
export async function deleteInspeccionesPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
