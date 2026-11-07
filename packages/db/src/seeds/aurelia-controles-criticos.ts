import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import {
  clientContacts,
  hourEntries,
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
 * Carga de la ficha de Leslie `AurelIA-Controles-criticos-proyecto-kora.xlsx` (corte 22/10/2026) en
 * el proyecto REAL "AurelIA - Controles críticos" (`legacy_id = 184`, del sync de la v1 — se resuelve
 * por `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Controles críticos carga" con una COPIA de las horas; `real` aplica sobre el proyecto real
 * (sin crear ni borrar horas, solo las imputa a la fase).
 *
 * UNA fase ("Controles críticos", 1.359 HH, 22/06–01/12) en la etapa Levantamiento — igual que la
 * etapa de avance del proyecto. Dos ciclos: el diseño preliminar (26/06–21/08) quedó desestimado y GF
 * detuvo el proyecto el 19/08; se reinició el 14/10 con el levantamiento del CR01. Cada tramo lleva su
 * etapa y su ciclo al inicio del nombre; etapas, hitos, incidentes y el historial semanal del Panel
 * quedan en la bitácora.
 *
 * Avance: el Panel reinició el porcentaje el 16/10 — 5% real / 5% esperado (Levantamiento al 5 de sus
 * 30). Para que Kora muestre lo mismo hay un solo ítem con peso: una tarea con el avance logrado de
 * Levantamiento (HH estimadas = 5% de 1.359, sin colaborador asignado → no genera Forecast). Las
 * entregas del diseño preliminar (rechazadas y desestimadas) van a la bitácora y no como entregas: con
 * fecha vencida y sin aprobar sumarían al esperado. El resto de las etapas no tiene fechas: sin ítems.
 *
 * Equipos como están en Kora. Estado del proyecto: Activo (reactivado el 14/10).
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-controles-criticos <preview|real|cleanup>`.
 */

const LEGACY_ID = 184;
const PREVIEW_NAME = 'AurelIA - Controles críticos carga';
const PHASE = 'Controles críticos';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAlexis: 'cd1b5960-73d5-4160-b996-262224245c79', // UX-UI
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // líder de Controles críticos
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — Catalina y Elisa ya los crean otras fichas (mismos ids); Daniel es nuevo. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
  daniel: 'a5b30000-0000-4000-8000-000000000001',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5b3c000' : 'a5b30000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    taskLevantamiento: id(31),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Módulo de AurelIA. El proyecto madre tuvo prospecto, cotización y aprobación; al aprobarse y activarse, cada módulo toma su fecha de inicio como Hito 0.';
const OBJETIVO =
  'Digitalizar la gestión de controles críticos (CR) de Medio Ambiente: autoevaluación con evidencia por control e ítem, validación en dos niveles y seguimiento de cumplimiento.\n\nAlcance vigente (definido por GF el 07/08): solución con el CR001 detallado y el resto de los CR genéricos. Las funcionalidades planteadas quedaron desestimadas porque GF está formalizando el proceso; existe un diseño preliminar adaptable.';

export interface SeedAureliaControlesCriticosResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
}

export async function seedAureliaControlesCriticos(db: Database, target: FichaTarget): Promise<SeedAureliaControlesCriticosResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Controles críticos" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Controles críticos" no tiene cliente asignado.');
  const clientId = realProject.clientId;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Responsable GF del módulo Inspecciones' },
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

    // 2. Datos generales + Hito 0 manual. `actualProgress` = caché de `ProjectProgressRecalculator`: 5%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'discovery',
        scopeNotes: OBJETIVO,
        hito0At: d('2026-06-22'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 5,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única, en Levantamiento (reiniciada el 14/10). Fin 01/12: "el plazo es diciembre".
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'discovery',
      estimatedHours: '1359.00',
      estimatedStartDate: d('2026-06-22'),
      estimatedEndDate: d('2026-12-01'),
    });

    // 4. Tramos T01–T09 (fechas desde los registros de horas), con etapa y ciclo al inicio del nombre.
    //    Sin `dailyPercent`: son pasados, no deben generar Forecast.
    const C1 = 'Levantamiento · Ciclo 1 (diseño preliminar)';
    const C2 = 'Levantamiento · Ciclo 2 (reinicio CR01)';
    const segments = [
      { team: REAL.teamDev, name: `${C1} · Revisión de procesos y MUE; alineamiento con Catalina y revisión de la propuesta`, start: '2026-06-26', end: '2026-07-10', users: [REAL.userAnaSoto, REAL.userSolmary] },
      { team: REAL.teamDev, name: `${C1} · Traspaso del flujo a UX y revisión del historial y de la propuesta`, start: '2026-07-27', end: '2026-08-04', users: [REAL.userSolmary] },
      { team: REAL.teamUx, name: `${C1} · Ideación y diseño de la propuesta genérica (Figma)`, start: '2026-07-29', end: '2026-08-06', users: [REAL.userAlexis] },
      { team: REAL.teamUx, name: `${C1} · Correcciones a la propuesta tras la muestra del 06/08`, start: '2026-08-07', end: '2026-08-07', users: [REAL.userAlexis] },
      { team: REAL.teamDev, name: `${C1} · Reunión de propuesta 2, revisión de la matriz CR y documentación`, start: '2026-08-06', end: '2026-08-19', users: [REAL.userSolmary] },
      { team: REAL.teamRpa, name: `${C1} · Levantamiento y revisión del proyecto`, start: '2026-08-20', end: '2026-08-21', users: [REAL.userJoseAponte] },
      { team: REAL.teamDev, name: `${C2} · Reunión de levantamiento del CR01 con Catalina`, start: '2026-10-14', end: '2026-10-14', users: [REAL.userSolmary] },
      { team: REAL.teamRpa, name: `${C2} · Reunión de levantamiento del CR01`, start: '2026-10-14', end: '2026-10-14', users: [REAL.userJoseAponte] },
      { team: REAL.teamUx, name: `${C2} · Levantamiento y ajustes del flujo del CR01`, start: '2026-10-19', end: '2026-10-20', users: [REAL.userAlexis] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Tarea con el avance logrado de Levantamiento: HH estimadas = peso (5% de 1.359 = 67,95 HH).
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance de la fase (Panel de Control AurelIA), no planificación de horas.';
    const TASK = { name: 'Etapa Levantamiento: avance logrado (5 de 30%)', start: '2026-10-14', date: '2026-10-20' };
    await tx.insert(projectModuleTasks).values({
      id: ID.taskLevantamiento,
      moduleId: ID.module,
      name: TASK.name,
      description: WEIGHT_NOTE,
      estimatedHours: '67.95',
      startDate: d(TASK.start),
      date: d(TASK.date),
      status: 'done',
      scope: 'diseno',
      completedAt: at(TASK.date, 5),
      createdAt: at(TASK.start),
      updatedAt: at(TASK.date, 5),
    });

    // 6. Bitácora: Hito 0, etapas, tarea (mismos textos que la API), hitos, incidentes e historial del Panel.
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    const onTask = { moduleId: ID.module, taskId: ID.taskLevantamiento };
    const panels: [string, number, number, string][] = [
      ['2026-07-27', 15, 15, '"Acelerar controles críticos para llegar a la fecha requerida (Septiembre)".'],
      ['2026-07-31', 15, 15, ''],
      ['2026-08-07', 30, 18, 'Muestra de propuesta genérica 06/08; GF define CR001 detallado + genéricos.'],
      ['2026-08-14', 30, 19, 'La lámina del módulo dice 18% real; la tabla "Proyectos" dice 19%.'],
      ['2026-08-21', 30, 18, 'Reunión con Elisa y Catalina: GF revisará internamente el proceso. (Lámina: 33% esperado.)'],
      ['2026-08-28', 30, 18, 'En espera de que GF explique el flujo. (Lámina: 33% esperado.)'],
      ['2026-09-04', 30, 18, 'Sin cambios.'],
      ['2026-09-11', 30, 18, 'Sin cambios.'],
      ['2026-09-25', 30, 18, 'Sin cambios.'],
      ['2026-10-02', 30, 18, 'Sin cambios.'],
      ['2026-10-09', 30, 18, 'Se agenda reunión de levantamiento para el 14/10. Resp. Kabeli pasa a Solmary/José.'],
      ['2026-10-16', 5, 5, 'Reinicio: nueva fecha de inicio 14/10 y porcentaje reiniciado.'],
      ['2026-10-23', 5, 5, 'Sin cambios (la lámina mantiene el texto del 16/10).'],
    ];
    const S = REAL.userSolmary;

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-06-22', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),

      // Etapas de la fase según el Panel de Control (Kora no las modela dentro de una fase).
      log('2026-10-14', 30, S, 'Etapa Levantamiento · peso 30% · desde 22/06 · 70,25 HH reales (Ciclo 1 · diseño preliminar 26/06–21/08: 54,25 HH; Ciclo 2 · reinicio CR01 desde 14/10: 16 HH) · avance 5 de 30 (el Panel reinició el porcentaje el 16/10).', { type: 'hito', title: 'Etapa "Levantamiento detallado" en curso (reiniciada)', status: 'activo', ...inModule }),
      log('2026-10-14', 31, S, 'Etapas Desarrollo (peso 40%), Pruebas G.F. (peso 25%) y Marcha blanca (peso 5%; en el Panel está sobre "Aprobado") sin iniciar y sin fechas. Plazo del proyecto: diciembre (fin 01/12).', { type: 'compromiso', title: 'Etapas "Desarrollo", "Pruebas G.F." y "Marcha blanca" por iniciar', status: 'pendiente', ...inModule }),

      // Tarea con el avance logrado.
      log(TASK.start, 0, S, `Nueva tarea "${TASK.name}" creada ${inPhase}, con fecha límite ${fmt(TASK.date)}.`, onTask),
      log(TASK.date, 5, S, `Tarea "${TASK.name}" marcada como aprobada ${inPhase}, ${deadline(TASK.date, TASK.date)}.`, onTask),

      // Hitos de la ficha (las muestras de diseño rechazadas no son ítems con peso — ver cabecera).
      log('2026-08-06', 40, S, '1ra muestra de la propuesta genérica en Figma: GF pidió correcciones y cambios en la reunión del 06/08.', { type: 'hito', title: '1ra muestra de la propuesta genérica (rechazada: cambios solicitados)', status: 'rechazado', ...inModule }),
      log('2026-08-07', 40, S, 'Gold Fields define el alcance: CR001 detallado y el resto de los CR genéricos; el plazo pasa a diciembre.', { type: 'hito', title: 'GF define el alcance (CR001 detallado + genéricos)', status: 'cumplido', ...inModule }),
      log('2026-08-11', 40, S, '2da muestra: propuesta 2 según los cambios. Kabeli envía el Excel de roles y funciones. GF pidió nuevos cambios.', { type: 'hito', title: '2da muestra de la propuesta (rechazada: cambios solicitados)', status: 'rechazado', ...inModule }),
      log('2026-08-13', 40, S, 'Término de la Propuesta V2 de diseño: el diseño fue desestimado (Presentación AurelIA 10-26).', { type: 'hito', title: 'Propuesta V2 de diseño (desestimada)', status: 'rechazado', ...inModule }),
      log('2026-08-13', 41, S, 'Daniel (GF) entrega la matriz actualizada de CR y confirma el documento.', { type: 'hito', title: 'Daniel entrega la matriz actualizada de CR', status: 'cumplido', ...inModule }),
      log('2026-08-19', 40, S, 'Elisa (aprobadora GF) detiene el proyecto: GF revisará internamente el proceso.', { type: 'hito', title: 'Elisa detiene el proyecto', status: 'cumplido', ...inModule }),
      log('2026-10-14', 40, S, 'Reinicio del proyecto: reunión de levantamiento del CR01 con Catalina. El Panel reinicia el porcentaje (de 30% esperado / 18% real a 5% / 5%).', { type: 'hito', title: 'Reinicio: levantamiento del CR01 con Catalina', status: 'cumplido', ...inModule }),

      // Incidentes de la ficha — Kora no tiene origen/severidad/responsable/relación: van en el texto.
      log('2026-07-27', 10, S, 'Proceso de controles críticos sin definición formal por Gold Fields ("Falta cerrar definición" en el Panel desde el 27/07). GF lo está estudiando y formalizando; al 23/10 debe indicar los ítems que requieren integración para reunirse con las áreas.\nTipo: Otro · Origen: Externo · Severidad: Alta · Relacionado: INC-03.', { type: 'incidente', title: 'INC-01 · Proceso de CR sin definición formal de GF', status: 'abierto', ...inModule }),
      log('2026-08-07', 10, S, 'Los MUE pasan a llamarse CR. GF define solución con el CR001 detallado y el resto genéricos; el plazo pasa de septiembre/octubre a diciembre.\nTipo: Cambio de alcance · Origen: Externo · Severidad: Media · Cerrado: 07/08 (con la definición de alcance).', { type: 'incidente', title: 'INC-02 · Cambio de alcance: CR001 detallado y plazo a diciembre', status: 'resuelto', ...inModule }),
      log('2026-08-11', 10, S, 'El documento de CR enviado por GF no coincidía con lo conversado en la reunión del 11/08 (puntos contradictorios).\nTipo: Espera de feedback cliente · Origen: Externo · Severidad: Media · Cerrado: 13/08 (Daniel entregó la matriz actualizada) · Relacionado: INC-01.', { type: 'incidente', title: 'INC-04 · Documento de CR contradictorio', status: 'resuelto', ...inModule }),
      log('2026-08-19', 10, S, 'Detención del proyecto por Elisa para que GF revise internamente el proceso. El diseño preliminar quedó desestimado y el avance se reinició (30/18 → 5/5).\nTipo: Otro (detención por el cliente) · Origen: Externo · Severidad: Alta · Cerrado: 14/10 (reinicio; 56 días corridos detenido) · Relacionado: INC-01.', { type: 'incidente', title: 'INC-03 · Proyecto detenido por Gold Fields', status: 'resuelto', ...inModule }),

      // Historial semanal de avance (tabla "Proyectos" del Panel).
      ...panels.map((panel) => panelObservation(log, S, PHASE, inModule, panel)),
    ];
    await tx.insert(projectObservations).values(entries.map((entry, index) => ({ ...entry, id: ID.observation(index) })));

    // 7. Horas — todas a la fase única: el real imputa las que ya tiene; el clon lleva una copia.
    const realHours = await tx.select().from(hourEntries).where(eq(hourEntries.projectId, realProject.id));
    if (target === 'real') {
      await tx.update(hourEntries).set({ moduleId: ID.module }).where(eq(hourEntries.projectId, projectId));
    } else if (realHours.length > 0) {
      await tx.insert(hourEntries).values(realHours.map(({ id: _id, legacyId: _legacyId, ...entry }) => ({ ...entry, projectId, moduleId: ID.module })));
    }

    return {
      projectId,
      projectName: target === 'preview' ? PREVIEW_NAME : realProject.name,
      hoursInPhase: realHours.filter((entry) => entry.status === 'approved').reduce((sum, entry) => sum + Number(entry.hours), 0),
    };
  });
}

/** Borra el clon "AurelIA - Controles críticos carga" con sus horas copiadas. */
export async function deleteControlesCriticosPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
