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
 * Carga de la ficha de Leslie `AurelIA-Incidentes-proyecto-kora.xlsx` (corte 22/10/2026) en el
 * proyecto REAL "AurelIA - Incidentes" (`legacy_id = 45`, del sync de la v1 — se resuelve por
 * `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Incidentes carga" con una COPIA de las horas; `real` aplica sobre el proyecto real (sin
 * crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Incidentes", 1.671 HH) que recorre las etapas del Panel de Control (30 · 40 · 25 · 5). La
 * fase está en Desarrollo — igual que la etapa de avance del proyecto ("En desarrollo"), que no cambia.
 * Cada tramo lleva su etapa al inicio del nombre; etapas, hitos, incidentes y el historial semanal del
 * Panel quedan en la bitácora.
 *
 * Avance: el Panel del 23/10 dice 50% real / 50% esperado — Levantamiento al 100% (30) y Desarrollo al
 * 50% (20 de 40); el resto congelado porque Gold Fields detuvo el proyecto el 26/08. Para que Kora
 * muestre lo mismo, los ítems con peso son: la tarea "de etapa" de Levantamiento, otra con el avance
 * logrado de Desarrollo (HH estimadas = peso, sin colaborador asignado → no generan Forecast) y la 1ra
 * entrega del 24/08 (validada por la líder, pendiente de confirmación de GF; pesa el promedio de las
 * tareas — ver `project-progress.ts`). Lo que falta (la otra mitad de Desarrollo, Pruebas y Marcha
 * blanca) queda sin ítems: cuenta en la base pero ni en el real ni en el esperado. Los hitos pendientes
 * van a la bitácora: con fecha vencida sumarían al esperado aunque el Panel lo congeló en 50%.
 *
 * Equipos como están en Kora (la ficha dice que no hay QA; en Kora el equipo QA figura con HH
 * asignadas y se deja así). Estado del proyecto: Activo, como el formulario; la detención por GF es el
 * incidente INC-02 (abierto).
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-incidentes <preview|real|cleanup>`.
 */

const LEGACY_ID = 45;
const PREVIEW_NAME = 'AurelIA - Incidentes carga';
const PHASE = 'Incidentes';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamIa: '7e96e0a9-86bb-44a9-96f2-46e3660e7ce4',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userCristian: '72333755-27c5-479b-a651-e50c27670b7c', // Desarrollo (desvinculado)
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userJairo: 'b08b1924-8fd0-40f0-8123-48e99a288b34', // IA
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userLiliana: 'b062dff8-f80f-4d8f-9993-98b5a90c47d4', // UX-UI
  userSergioMoreno: 'b9b920d3-4647-4907-a19b-fa2daec9c01f', // IA
  userSergioVidal: '813596a5-c9ee-46f3-b692-ee031e3e0543', // Desarrollo
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Incidentes
  userUriel: '61131ccf-758e-4181-a0dd-a7bb84917353', // IA
  userViktoriia: '1f873704-ada9-4eea-983b-aad7e5da8985', // IA
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean las fichas de Inspecciones (Catalina, Marjorie) y SPR (Elisa); mismos ids. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  marjorie: 'a5b10000-0000-4000-8000-000000000002',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b2c000' : 'a5b20000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    deliveryPrimeraEntrega: id(21),
    taskEtapaLevantamiento: id(31),
    taskEtapaDesarrollo: id(32),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Reemplazar el seguimiento manual en Excel y las presentaciones de investigación ICAM por un sistema integrado que centralice el ciclo completo de gestión de incidentes ambientales, desde el registro en terreno hasta el cierre formal, con trazabilidad total y flujos de validación por roles.\n\nFuncionalidades: registro de incidente en móvil; Flash Report en 3 láminas con datos pre-llenados y validación en cascada; seguimiento de acciones del Flash Report con evidencia validada por la Coordinadora MA; investigación ICAM con datos heredados y sugerencias de IA; plan de acción correctivo con alertas y escalamiento; dashboard analítico con KPIs y filtros.';

export interface SeedAureliaIncidentesResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaIncidentes(db: Database, target: FichaTarget): Promise<SeedAureliaIncidentesResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Incidentes" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Incidentes" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las fichas de SPR/Inspecciones).
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

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 50%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'development',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-06-04'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 50,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única. Fin 30/09 vencido: el proyecto está detenido por GF desde el 26/08.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'development',
      estimatedHours: '1671.00',
      estimatedStartDate: d('2026-06-04'),
      estimatedEndDate: d('2026-09-30'),
    });

    // 4. Tramos T01–T13 (fechas calculadas desde los registros de horas), con su etapa al inicio del
    //    nombre. Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Levantamiento · Levantamiento con cliente, AS IS del flujo, ICAM y 5 porqués, estimación, kickoff, PRD y revisión de flujos y diseño', start: '2026-06-04', end: '2026-07-02', users: [REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamUx, name: 'Levantamiento · PRD, flujos de usuario, catálogo de pantallas, diseño, presentaciones y correcciones finales para validación', start: '2026-06-11', end: '2026-07-02', users: [REAL.userLiliana, REAL.userEduardo] },
      { team: REAL.teamIa, name: 'Levantamiento · Prototipo de agente en Telegram y EDA inicial', start: '2026-07-01', end: '2026-07-02', users: [REAL.userSergioMoreno, REAL.userViktoriia] },
      { team: REAL.teamIa, name: 'Desarrollo · EDA de incidentes históricos (análisis, informe y planilla de incidentes tipo 3, 4 y 5)', start: '2026-07-03', end: '2026-08-13', users: [REAL.userViktoriia, REAL.userJairo] },
      { team: REAL.teamDev, name: 'Desarrollo · Traspaso de información al equipo IA, alineación y primeras horas de desarrollo', start: '2026-07-03', end: '2026-07-21', users: [REAL.userSolmary, REAL.userAnaSoto, REAL.userCristian] },
      { team: REAL.teamDev, name: 'Desarrollo · AppWeb: dashboard del módulo de incidentes', start: '2026-07-27', end: '2026-07-31', users: [REAL.userSergioVidal, REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Desarrollo · AppWeb: módulo Flash Report y reuniones con GF (definiciones IA)', start: '2026-08-03', end: '2026-08-14', users: [REAL.userSergioVidal, REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamIa, name: 'Desarrollo · Diseño de arquitectura del agente, historias de usuario y estimación', start: '2026-08-17', end: '2026-08-24', users: [REAL.userJairo] },
      { team: REAL.teamDev, name: 'Desarrollo · AppWeb: perfiles, workflow ICAM y paso a QA del dashboard y Flash Report (entrega sin IA)', start: '2026-08-17', end: '2026-08-24', users: [REAL.userSergioVidal, REAL.userAnaSoto] },
      { team: REAL.teamDev, name: 'Desarrollo · AppWeb: backend, seguimiento y cierre del flujo ICAM; revisión de lo desarrollado (detenido)', start: '2026-08-25', end: '2026-09-01', users: [REAL.userSergioVidal, REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamDev, name: 'Desarrollo · App mobile: levantamiento y flujos de registro de incidentes (detenido)', start: '2026-08-25', end: '2026-08-28', users: [REAL.userCarlo] },
      { team: REAL.teamIa, name: 'Desarrollo · Estructura base del agente, pgvector y chunks, retrieval, motor de sugerencias y entorno de pruebas (detenido)', start: '2026-08-25', end: '2026-08-28', users: [REAL.userJairo, REAL.userUriel, REAL.userViktoriia] },
      { team: REAL.teamRpa, name: 'Desarrollo · Seguimiento RPA (detenido)', start: '2026-08-28', end: '2026-09-01', users: [REAL.userJoseAponte] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. 1ra entrega (H02, 24/08): desarrollo sin IA para el primer feedback de GF — validada por la
    //    líder, pendiente de confirmación de GF (sin feedback por la detención).
    const ENTREGA = '1ra entrega: desarrollo sin IA para primer feedback de GF';
    await tx.insert(projectModuleDeliveries).values({
      id: ID.deliveryPrimeraEntrega,
      moduleId: ID.module,
      teamId: REAL.teamDev,
      name: ENTREGA,
      description:
        'Dashboard y Flash Report de la AppWeb, presentados a GF en reunión el 24/08 (ese día se pasaron a QA). Validada por la líder; pendiente de confirmación de GF: sin feedback registrado por la detención del 26/08.',
      assigneeUserId: REAL.userSergioVidal,
      estimatedDate: d('2026-08-24'),
      status: 'approved',
      createdAt: at('2026-07-03'),
      updatedAt: at('2026-08-24', 5),
    });

    // 6. Tareas "de etapa": HH estimadas = peso (ver cabecera). 334,2 + 222,8 = 557 HH, que con la
    //    entrega (promedio: 278,5) suman 835,5 = 50% de 1.671.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, name: 'Etapa Levantamiento detallado (peso 30%)', scope: 'diseno', hours: '334.20', start: '2026-06-04', date: '2026-07-02' },
      { id: ID.taskEtapaDesarrollo, name: 'Etapa Desarrollo: avance logrado (20 de 40%)', scope: 'desarrollo', hours: '222.80', start: '2026-07-03', date: '2026-08-24' },
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

    // 7. Bitácora: Hito 0, etapas, entrega y tareas (mismos textos que la API), hitos, incidentes e
    //    historial semanal del Panel (valores de la lámina del módulo).
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onDelivery = { moduleId: ID.module, deliveryId: ID.deliveryPrimeraEntrega };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 35, 35, ''],
      ['2026-07-31', 35, 35, ''],
      ['2026-08-07', 45, 45, 'Kabeli solicita reunión para revisar avance del Web dashboard y Flash Report (acordada para el 10/08).'],
      ['2026-08-14', 45, 45, 'Se requieren definiciones para el agente IA; GF las envió el 13/08.'],
      ['2026-08-21', 50, 50, 'Equipo IA revisa definiciones. Se pide acceso a Flash Reports (18/08). Pendiente reunión con Elisa.'],
      ['2026-08-28', 50, 50, '26/08: Elisa informa que el proyecto está detenido. (La tabla resumen del Panel mostraba 65/65.)'],
      ['2026-09-04', 50, 50, 'Igual al 28/08. (Tabla resumen: 65/65.)'],
      ['2026-09-11', 50, 50, 'Igual al 28/08. (Tabla resumen: 65/65.)'],
      ['2026-09-25', 50, 50, 'Texto arrastrado de versiones anteriores.'],
      ['2026-10-02', 50, 50, 'Texto arrastrado de versiones anteriores.'],
      ['2026-10-09', 50, 50, 'Se encuentra detenido.'],
      ['2026-10-16', 50, 50, 'Se encuentra detenido.'],
      ['2026-10-23', 50, 50, 'Se encuentra detenido (lámina fechada 16/10).'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-06-04', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-07-02', 30, S, 'Etapa Levantamiento · peso 30% · 04/06–02/07 · 138,75 HH reales · avance 100%. Inicio = Hito 0; cierra con las correcciones finales de diseño para validación (Liliana, 02/07).', { type: 'hito', title: 'Etapa "Levantamiento detallado" finalizada', status: 'cumplido', ...inModule }),
      log('2026-07-03', 30, S, 'Etapa Desarrollo · peso 40% · desde 03/07 · 436,5 HH reales · avance 50% (20 de 40, según la lámina de Fases del Panel 23/10). Detenida por el cliente desde el 26/08.', { type: 'hito', title: 'Etapa "Desarrollo" en curso (detenida)', status: 'activo', ...inModule }),
      log('2026-07-03', 31, S, 'Etapas Pruebas G.F. (peso 25%) y Marcha blanca (peso 5%; en el Panel está sobre "Aprobado") sin iniciar. Sin fechas: dependen de que GF reanude el proyecto.', { type: 'compromiso', title: 'Etapas "Pruebas G.F." y "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // 1ra entrega y tareas de etapa.
      log('2026-07-03', 0, S, `Nueva entrega "${ENTREGA}" agregada ${inPhase}, estimada para ${fmt('2026-08-24')}.`, onDelivery),
      log('2026-08-24', 0, REAL.userSergioVidal, `Entrega "${ENTREGA}" marcada como terminada ${inPhase}, ${deadline('2026-08-24', '2026-08-24')}; queda pendiente de aprobación.`, onDelivery),
      log('2026-08-24', 5, S, `Entrega "${ENTREGA}" aprobada ${inPhase}, ${deadline('2026-08-24', '2026-08-24')}.`, onDelivery),
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        return [
          log(task.start, 0, S, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask),
          log(task.date, 5, S, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.date)}.`, onTask),
        ];
      }),

      // Hitos de la ficha que no son ítems con peso.
      log('2026-08-13', 40, S, 'Reunión para definiciones de los agentes IA: Gold Fields envió las definiciones el jueves 13/08 (OK cliente).', { type: 'hito', title: 'Reunión para definiciones de agentes IA', status: 'cumplido', ...inModule }),
      log('2026-08-26', 40, S, 'Elisa (aprobadora GF) informa que el proyecto queda detenido.', { type: 'hito', title: 'Elisa detiene el proyecto', status: 'cumplido', ...inModule }),
      log('2026-09-30', 40, S, 'Aprobación de Gold Fields comprometida para la fecha de fin (30/09): vencida, el proyecto sigue detenido por GF.', { type: 'compromiso', title: 'Aprobación Gold Fields (fecha de fin)', status: 'pendiente', ...inModule }),

      // Incidentes de la ficha — Kora no tiene severidad/origen/responsable/relación: van en el texto.
      log('2026-08-18', 10, S, 'Falta de acceso a los documentos de Flash Report para extraer medidas preventivas y entrenar el modelo del agente IA. Kabeli espera la autorización de GF (solicitado el 18/08).\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Alta · Responsable: Catalina / Marjorie (GF).', { type: 'incidente', title: 'INC-01 · Sin acceso a los Flash Report para el agente IA', status: 'abierto', ...inModule }),
      log('2026-08-26', 10, S, 'Detención del proyecto informada por Elisa. Pendiente además la reunión con Elisa para revisar el diseño.\nTipo: Otro (detención por el cliente) · Origen: Externo · Severidad: Alta · Responsable: Elisa (GF).', { type: 'incidente', title: 'INC-02 · Proyecto detenido por Gold Fields', status: 'abierto', ...inModule }),
      log('2026-10-01', 10, S, 'La aprobación de Gold Fields (fecha de fin 30/09) venció sin confirmarse. El atraso es atribuible a la detención del cliente.\nTipo: Atraso en entrega · Origen: Externo · Severidad: Media · Responsable: Solmary Castro · Relacionado: INC-02.', { type: 'incidente', title: 'INC-03 · Atraso en la aprobación de GF', status: 'abierto', ...inModule }),

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

/** Borra el clon "AurelIA - Incidentes carga" con sus horas copiadas. */
export async function deleteIncidentesPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
