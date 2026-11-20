import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
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
 * Carga de la ficha de Leslie `AurelIA-proyecto-kora.xlsx` (corte 23/10/2026) en el proyecto REAL
 * "AurelIA - Administración" (`legacy_id = 36`, el proyecto madre de AurelIA — se resuelve por
 * `legacyId`). Mismos destinos que `aurelia-inspecciones.ts`: `preview` crea/recrea el clon
 * "AurelIA - Administración carga" con una COPIA de las horas; `real` aplica sobre el proyecto real (sin
 * crear ni borrar horas, solo las imputa a la fase) y, a pedido, borra antes las fases cargadas a mano
 * (la fase "SPR" de prueba del 21–23/10) con su bitácora: queda solo lo de la ficha.
 *
 * UNA fase ("AurelIA", 6.859 HH, 01/06–06/11) que mide el avance agregado de los 16 módulos del
 * programa (cada módulo es un proyecto propio en Kora con su ficha) y agrupa las horas imputadas a
 * "AurelIA" sin módulo: gestión del programa, arquitectura y módulo Administración, UX, QA transversal y
 * seguimiento RPA. Etapa: Desarrollo.
 *
 * Avance: 52% real = promedio simple de los 16 módulos según la Presentación AurelIA 10-26 (pesos 30 ·
 * 40 · 25 · 5 → Levantamiento 100%, Desarrollo 55,5%). La Presentación no trae esperado: lo pendiente
 * vence el 06/11, último término de módulo en el Panel (Monitoreo de agua), así que hoy el esperado es
 * igual al real. La fecha de fin del proyecto (01/08, vencida) pasa al 06/11 con su registro.
 *
 * Horas: la ficha supone 205,15 HH del equipo IA (sin export) para cuadrar con las 672,15 de Kora, pero
 * esas horas del equipo IA ya se movieron a "AurelIA - Agentes" el 21/10: la diferencia con el export son
 * horas de UX/Desarrollo de mayo–junio. Los tramos salen de las horas que Kora tiene hoy en el proyecto.
 *
 * Equipos como están en Kora (RPA, IA, UX-UI, Desarrollo, QA). Estado: Activo, como el formulario.
 *
 * Se corre a mano con `pnpm --filter @kora/db seed:aurelia-administracion <preview|real|cleanup>`.
 */

const LEGACY_ID = 36;
const PREVIEW_NAME = 'AurelIA - Administración carga';
const PHASE = 'AurelIA';
const SOLD_HOURS = '6859.00';
const END_DATE = '2026-11-06';

// IDs reales, ya existentes en la base — NO se crean acá.
const REAL = {
  teamDev: '91d19384-334b-4cc8-a776-c5a59036316f',
  teamQa: 'd9ddcdf5-a621-4a81-8aa3-97856800f435',
  teamRpa: '50a796e3-3382-4c4e-baa1-11b2430df60d',
  teamUx: '7eb21db7-cf7a-472b-9e14-569f286417a1',

  userAlexis: 'cd1b5960-73d5-4160-b996-262224245c79', // UX-UI
  userAnaSoto: '89cdcf98-2801-4e29-b181-db3ca22e71c7', // Desarrollo
  userCarlo: '7dde1ca2-9107-48c0-8554-66886bf314fb', // Desarrollo
  userConstanza: '993ba721-0f33-4eca-9967-7072c10a48b6', // QA
  userEduardo: '064969c7-c586-4261-a7e6-255669ab4237', // UX-UI (líder)
  userFrancisca: 'c3aaa952-108a-4510-b61c-1dec8e23f479', // QA
  userJoseAponte: '5edce9f8-b995-43be-86c4-702aa929c2ee', // RPA — líder del proyecto madre
  userLiliana: 'b062dff8-f80f-4d8f-9993-98b5a90c47d4', // UX-UI
  userMariaJose: '0c18aac5-943e-4167-834e-c5d956f0c269', // Desarrollo (salió el 20/10)
  userNicolasParra: 'f71af37d-8ad5-44f0-a1a7-03330fd3282f', // Desarrollo (salió el 20/10)
  userSolmary: 'ea6d5a9b-e3bb-47f7-a064-60ac27a593fb', // Desarrollo (PM)
  userClaudio: 'b3b252f8-5640-497b-89d8-5bcc23e536f8', // quien registra la carga
} as const;

/** Contactos de Gold Fields — ya los crean otras fichas (mismos ids). Elisa aprueba todos los módulos. */
const CONTACTS = {
  catalina: 'a5b10000-0000-4000-8000-000000000001',
  elisa: 'a5b00000-0000-4000-8000-000000000002',
} as const;

const ids = (target: FichaTarget) => {
  const prefix = target === 'preview' ? 'a5bcc000' : 'a5bc0000';
  const id = fixedId(prefix);
  return {
    prefix,
    previewProject: id(10),
    module: id(11),
    taskEtapaLevantamiento: id(31),
    taskDesarrolloLogrado: id(32),
    taskDesarrolloRestante: id(33),
    taskPruebasGf: id(34),
    taskMarchaBlanca: id(35),
    /** Rango 100–199: bitácora. */
    observation: (n: number) => id(100 + n),
  };
};

const HITO0_REASON =
  'Proyecto madre de AurelIA (programa de 16 módulos para Gold Fields, cada uno con proyecto propio en Kora). Fecha de inicio del programa = primer registro de horas en el capacity (01/06).';
const OBJETIVO =
  'Plataforma de Gestión Ambiental Integral para la Gerencia de Medio Ambiente de Gold Fields (Salares Norte): pasar de una gestión fragmentada, manual y reactiva (Excel, PDF, correos, plataformas de terceros que vencen) a una gestión unificada, trazable y proactiva en un solo lugar, apoyada con automatizaciones RPA e Inteligencia Artificial, desde el primer clic en terreno hasta la firma del reporte oficial.\n\nPuntos de dolor: datos dispersos (Excel, correos y PDF como sistema oficial); dependencia de terceros (el historial ambiental vive en plataformas externas que vencen); reportes bajo presión (SMA, SAC, SIDREP/SINADER armados a mano); cero trazabilidad (un hallazgo de terreno se pierde antes de llegar a cierre).\n\nClaves: consolidación, digitalización, trazabilidad, monitoreo y control, reportabilidad bilingüe, valor estratégico y predictibilidad. Kabeli obtuvo el primer lugar categoría PYME a la implementación de inteligencia artificial en Chile.';

/** Avance por módulo según la Presentación AurelIA 10-26 (lámina "Fases 23-10-2026"). */
const MODULES: readonly [number, string, number, string][] = [
  [1, 'Inspecciones', 70, 'Pruebas · detenido por Elisa desde el 26/08'],
  [2, 'Incidentes', 50, 'Desarrollo · detenido por Elisa desde el 26/08'],
  [3, 'SPR', 85, 'Pruebas'],
  [4, 'Impuesto verde / Catastro Horno y Caldera', 85, 'Pruebas (el Panel dice 75%)'],
  [5, 'Residuos y Bodega Resiter', 75, 'Pruebas'],
  [6, 'Controles críticos', 10, 'Levantamiento · reiniciado el 14/10 (CR01)'],
  [7, 'Sustancias peligrosas', 75, 'Pruebas'],
  [8, 'Capacitaciones ambientales', 75, 'Pruebas'],
  [9, 'Gestión documental', 85, 'Pruebas'],
  [10, 'Sistema de Gestión Ambiental', 0, 'Sin iniciar · proyecto en Kora en borrador'],
  [11, 'Monitoreo de agua', 70, 'Pruebas'],
  [12, 'Monitoreo de aire', 70, 'Pruebas'],
  [13, 'Registro de incumplimiento', 0, 'Sin iniciar · proyecto en Kora en borrador'],
  [14, 'AurelIA Dashboard', 0, 'Sin iniciar ("Próximamente") · sin proyecto en Kora'],
  [15, 'AurelIA Agentes (asistente)', 75, 'Pruebas'],
  [16, 'Gestión del cambio', 10, 'Levantamiento · proyecto en Kora en borrador (cotización)'],
];

export interface SeedAureliaAdministracionResult {
  projectId: string;
  projectName: string;
  hoursInPhase: number;
  manualPhasesRemoved: number;
  manualObservationsRemoved: number;
}

export async function seedAureliaAdministracion(db: Database, target: FichaTarget): Promise<SeedAureliaAdministracionResult> {
  const ID = ids(target);

  const [realProject] = await db.select().from(projects).where(eq(projects.legacyId, LEGACY_ID)).limit(1);
  if (!realProject) {
    throw new Error(`No se encontró "AurelIA - Administración" (legacy_id=${LEGACY_ID}) en esta base — ¿corrió el ETL/sync desde la v1 en este ambiente?`);
  }
  if (!realProject.clientId) throw new Error('"AurelIA - Administración" no tiene cliente asignado.');
  const clientId = realProject.clientId;
  const endDateBefore = realProject.endDate;

  return db.transaction(async (tx) => {
    // 0. Contactos del cliente (por si este ambiente no tiene aún las otras fichas).
    await tx
      .insert(clientContacts)
      .values([
        { id: CONTACTS.catalina, clientId, name: 'Catalina', position: 'Contraparte GF' },
        { id: CONTACTS.elisa, clientId, name: 'Elisa', position: 'Aprobadora de diseño (SPR)' },
      ])
      .onConflictDoNothing({ target: clientContacts.id });

    // 1. Proyecto destino — el real, o un clon recién creado.
    let projectId = realProject.id;
    let manualPhasesRemoved = 0;
    let manualObservationsRemoved = 0;
    if (target === 'preview') {
      projectId = ID.previewProject;
      await createPreviewProject(tx, realProject, projectId, PREVIEW_NAME);
    } else {
      // Re-corrida: se reemplaza lo que siembra este archivo (ids fijos)…
      await tx
        .delete(projectObservations)
        .where(and(eq(projectObservations.projectId, projectId), sql`${projectObservations.id}::text like ${`${ID.prefix}-%`}`));
      await tx.delete(projectModules).where(inArray(projectModules.id, [ID.module]));
      // …y, a pedido, lo cargado a mano: las demás fases (cascada a tramos/tareas/entregas y su Forecast
      // de tramo) y su bitácora — primero la bitácora, que el FK dejaría suelta, sin fase ni entrega.
      const manualModules = await tx
        .select({ id: projectModules.id })
        .from(projectModules)
        .where(and(eq(projectModules.projectId, projectId), ne(projectModules.id, ID.module)));
      if (manualModules.length > 0) {
        const moduleIds = manualModules.map((row) => row.id);
        const manualDeliveries = await tx
          .select({ id: projectModuleDeliveries.id })
          .from(projectModuleDeliveries)
          .where(inArray(projectModuleDeliveries.moduleId, moduleIds));
        const removedObservations = await tx
          .delete(projectObservations)
          .where(
            and(
              eq(projectObservations.projectId, projectId),
              or(
                inArray(projectObservations.moduleId, moduleIds),
                manualDeliveries.length > 0 ? inArray(projectObservations.deliveryId, manualDeliveries.map((row) => row.id)) : sql`false`,
              ),
            ),
          )
          .returning({ id: projectObservations.id });
        const removedModules = await tx.delete(projectModules).where(inArray(projectModules.id, moduleIds)).returning({ id: projectModules.id });
        manualPhasesRemoved = removedModules.length;
        manualObservationsRemoved = removedObservations.length;
      }
    }

    // 2. Datos generales + Hito 0 manual + fecha de fin al 06/11. `actualProgress` = caché de
    //    `ProjectProgressRecalculator`: 52%.
    await tx
      .update(projects)
      .set({
        primaryContactId: CONTACTS.catalina,
        phase: 'development',
        scopeNotes: OBJETIVO,
        soldHours: SOLD_HOURS,
        endDate: d(END_DATE),
        hito0At: d('2026-06-01'),
        hito0Source: 'manual',
        hito0Reason: HITO0_REASON,
        pendingManagementApproval: false,
        actualProgress: 52,
      })
      .where(eq(projects.id, projectId));

    // 3. Fase única del programa, en Desarrollo. Fin 06/11.
    await tx.insert(projectModules).values({
      id: ID.module,
      projectId,
      name: PHASE,
      initialStage: 'discovery',
      currentStage: 'development',
      estimatedHours: SOLD_HOURS,
      estimatedStartDate: d('2026-06-01'),
      estimatedEndDate: d(END_DATE),
    });

    // 4. Tramos: una línea de trabajo por equipo con las horas que Kora tiene en el proyecto (primer y
    //    último registro). El equipo IA no tiene horas acá (se movieron a Agentes). Sin `dailyPercent`:
    //    son pasados, no deben generar Forecast.
    const segments = [
      { team: REAL.teamDev, name: 'Desarrollo · Gestión y coordinación del programa: alineación y seguimiento de todo AurelIA, PPT semanal al cliente, infraestructura/accesos, estimaciones y orden de horas en Kora', start: '2026-05-27', end: '2026-10-21', users: [REAL.userSolmary, REAL.userAnaSoto] },
      { team: REAL.teamDev, name: 'Desarrollo · Arquitectura e infraestructura, integraciones generales, login, administración de usuarios/empresas, configuración para soporte y traducciones', start: '2026-06-22', end: '2026-10-15', users: [REAL.userCarlo, REAL.userNicolasParra, REAL.userMariaJose] },
      { team: REAL.teamRpa, name: 'RPA · Seguimiento transversal del programa, traspaso a nuevo desarrollador, diseño de solución, reuniones de arquitectura, estimación de módulos y HU del chat AurelIA', start: '2026-06-17', end: '2026-10-16', users: [REAL.userJoseAponte] },
      { team: REAL.teamUx, name: 'UX-UI · Diseño y levantamientos de módulos (Gestión documental, Impuesto verde, SUSPEL, Residuos), diseño del módulo Administración general, manuales de usuario y coordinación del equipo UX', start: '2026-05-27', end: '2026-10-19', users: [REAL.userLiliana, REAL.userAlexis, REAL.userEduardo] },
      { team: REAL.teamQa, name: 'QA · Pruebas transversales: casos de prueba del Chat Box general AurelIA (Telegram) y pruebas de carga con JMeter', start: '2026-08-21', end: '2026-10-20', users: [REAL.userFrancisca, REAL.userConstanza] },
    ];
    for (const segment of segments) {
      const [row] = await tx
        .insert(projectModuleSegments)
        .values({ moduleId: ID.module, teamId: segment.team, name: segment.name, startDate: d(segment.start), endDate: d(segment.end) })
        .returning({ id: projectModuleSegments.id });
      const memberIds = await Promise.all(segment.users.map((userId) => resolveTeamMembership(tx, segment.team, userId)));
      await tx.insert(projectModuleSegmentMembers).values(memberIds.map((teamMemberId) => ({ segmentId: row!.id, teamMemberId })));
    }

    // 5. Tareas: HH estimadas = peso del avance agregado (ver cabecera). Levantamiento 30% y Desarrollo
    //    22,19 de 40 aprobados al corte (52%); el resto de Desarrollo, Pruebas G.F. y Marcha blanca vencen
    //    el 06/11. Sin entregas a nivel programa: las entregas están en cada módulo.
    const WEIGHT_NOTE = 'HH estimadas = peso en el avance agregado del programa (promedio de los 16 módulos, Presentación AurelIA 10-26), no planificación de horas.';
    const tasks = [
      { id: ID.taskEtapaLevantamiento, team: null, name: 'Etapa Levantamiento detallado del programa (peso 30%)', scope: 'diseno', hours: '2057.70', start: '2026-06-01', date: '2026-10-23', doneOn: '2026-10-23' },
      { id: ID.taskDesarrolloLogrado, team: null, name: 'Desarrollo del programa: avance logrado al 23/10 (22,19 de 40%)', scope: 'desarrollo', hours: '1521.83', start: '2026-06-01', date: '2026-10-23', doneOn: '2026-10-23' },
      { id: ID.taskDesarrolloRestante, team: null, name: 'Desarrollo del programa: avance restante (17,81 de 40%)', scope: 'desarrollo', hours: '1221.76', start: '2026-10-23', date: END_DATE, doneOn: null },
      { id: ID.taskPruebasGf, team: null, name: 'Pruebas G.F. del programa (peso 25%)', scope: 'revision_cliente', hours: '1714.75', start: '2026-10-23', date: END_DATE, doneOn: null },
      { id: ID.taskMarchaBlanca, team: null, name: 'Marcha blanca del programa (peso 5%)', scope: 'revision_cliente', hours: '342.95', start: '2026-10-23', date: END_DATE, doneOn: null },
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

    // 6. Bitácora: Hito 0 y fecha de fin, etapas del programa y avance por módulo, tareas (mismos textos
    //    que la API), hitos, incidentes de programa e historial semanal del Panel (promedio de módulos).
    const log = observationLogger(projectId);
    const inPhase = `en fase "${PHASE}"`;
    const inModule = { moduleId: ID.module };
    // [fecha, esperado, real, nota] — promedio simple de los módulos informados en cada corte del Panel.
    const panels: [string, number, number, string][] = [
      ['2026-08-07', 29, 29, 'Promedio de 9 módulos informados.'],
      ['2026-08-14', 29, 30, 'Promedio de 12 módulos informados (Monitoreo de agua y aire en una sola línea).'],
      ['2026-08-21', 34, 34, 'Promedio de 12 módulos informados.'],
      ['2026-08-28', 39, 38, 'Promedio de 12 módulos informados.'],
      ['2026-09-04', 45, 45, 'Promedio de 12 módulos informados.'],
      ['2026-09-11', 47, 50, 'Promedio de 12 módulos informados.'],
      ['2026-09-25', 56, 52, 'Promedio de 13 módulos informados (entra Agentes).'],
      ['2026-10-02', 59, 54, 'Promedio de 13 módulos informados.'],
      ['2026-10-09', 57, 53, 'Promedio de 14 módulos informados (entra Gestión del cambio).'],
      ['2026-10-16', 57, 54, 'Promedio de 14 módulos informados.'],
      ['2026-10-23', 50, 47, 'Promedio de los 16 módulos (entran Registro de incumplimiento y AurelIA Dashboard en 0%). Los promedios no son comparables entre cortes.'],
    ];
    const J = REAL.userJoseAponte;
    const S = REAL.userSolmary;
    const moduleLines = MODULES.map(([n, name, pct, state]) => `${n}. ${name}: ${pct}% · ${state}`).join('\n');

    const entries: Omit<ObservationInsert, 'id'>[] = [
      log('2026-06-01', 0, REAL.userClaudio, `Proyecto activado manualmente (Hito 0) — comienzan a correr las horas. Motivo: ${HITO0_REASON}`, { isHito0: true }),
      log('2026-10-23', 0, REAL.userClaudio, `Fecha de fin actualizada de ${endDateBefore ? fmt(endDateBefore.toISOString().slice(0, 10)) : 'sin definir'} a ${fmt(END_DATE)}.`),

      // Etapas del programa y avance por módulo (Kora no modela el programa dentro de una fase).
      log('2026-10-23', 30, J, 'Avance del programa al 23/10 (Presentación AurelIA 10-26): 52% = promedio simple de los 16 módulos, con pesos 30 · 40 · 25 · 5 → Levantamiento detallado 100% (30), Desarrollo 55,5% (22,19 de 40), Pruebas G.F. 0%, Marcha blanca 0%. 13 módulos iniciados, 3 sin iniciar (SGA, Registro de incumplimiento, AurelIA Dashboard) y 2 detenidos (Inspecciones, Incidentes). La Presentación no informa esperado; el Panel 23/10 promedia 49,6% esperado / 47,1% real.', { type: 'hito', title: 'Avance del programa al 23/10: 52% (etapa Desarrollo)', status: 'activo', ...inModule }),
      log('2026-10-23', 31, J, `Avance por módulo según la Presentación AurelIA 10-26 (lámina "Fases 23-10-2026"); cada módulo es un proyecto propio en Kora (salvo AurelIA Dashboard):\n${moduleLines}`, { type: 'observacion', title: 'Avance por módulo · Presentación 10-26', status: null, ...inModule }),

      // Tareas.
      ...tasks.flatMap((task) => {
        const onTask = { moduleId: ID.module, taskId: task.id };
        const created = log(task.start, 0, J, `Nueva tarea "${task.name}" creada ${inPhase}, con fecha límite ${fmt(task.date)}.`, onTask);
        if (!task.doneOn) return [created];
        return [created, log(task.doneOn, 5, J, `Tarea "${task.name}" marcada como aprobada ${inPhase}, ${deadline(task.date, task.doneOn)}.`, onTask)];
      }),

      // Hitos del programa (los de cada módulo están en sus fichas).
      log('2026-09-03', 40, S, 'Reunión de validación con Elisa: revisión de diseño de módulos (registro de horas de Eduardo Aranda).', { type: 'hito', title: 'Reunión de validación con Elisa (diseño de módulos)', status: 'cumplido', ...inModule }),
      log('2026-09-28', 40, S, 'Revisión del módulo Administración con Marjorie y preparación de "Hitos AurelIA" para Rodrigo (registro de horas de Solmary Castro).', { type: 'hito', title: 'Revisión del módulo Administración con Marjorie', status: 'cumplido', ...inModule }),
      log('2026-10-23', 40, S, 'Presentación de los módulos AurelIA a Gold Fields (Presentación AurelIA 10-26), preparada el 20/10. Regla de gobierno (Panel 23/10): todo módulo debe estar aprobado por Elisa; los ya en desarrollo o entrega también pasan a su revisión.', { type: 'compromiso', title: 'Presentación de módulos AurelIA a Gold Fields (23/10)', status: 'pendiente', ...inModule }),

      // Incidentes de nivel programa — Kora no tiene origen/severidad/relación: van en el texto.
      log('2026-08-14', 10, S, 'Ambiente QA no disponible; gestión durante todo el día con infraestructura para dejarlo estable.\nTipo: Bloqueo técnico · Origen: Interno · Módulos: transversal (QA) · Cerrado: 14/08.', { type: 'incidente', title: 'INC-05 · Ambiente QA no disponible', status: 'resuelto', ...inModule }),
      log('2026-08-19', 10, S, 'Controles críticos detenido por Elisa el 19/08; se retoma con la reunión de levantamiento CR01 del 14/10 y reinicio del % de avance.\nTipo: Otro · Origen: Externo · Módulos: Controles críticos · Cerrado: 14/10 · Relacionado: INC-02.', { type: 'incidente', title: 'INC-03 · Controles críticos detenido por Elisa', status: 'resuelto', ...inModule }),
      log('2026-08-26', 10, S, 'Detención de módulos por el cliente (Elisa, 26/08). Además quedan pendientes accesos a información histórica para entrenar los agentes IA.\nTipo: Otro · Origen: Externo · Módulos: Inspecciones, Incidentes.', { type: 'incidente', title: 'INC-02 · Inspecciones e Incidentes detenidos por Elisa', status: 'abierto', ...inModule }),
      log('2026-09-29', 10, S, 'Módulos entregados a pruebas sin feedback de Gold Fields. Cuanto más rápido llega el feedback, más rápido se cierran las entregas.\nTipo: Espera de feedback cliente · Origen: Externo · Módulos: SPR, Residuos y Bodega, Gestión documental.', { type: 'incidente', title: 'INC-01 · Espera de feedback de GF en módulos entregados', status: 'abierto', ...inModule }),
      log('2026-10-02', 10, S, 'Falta de credenciales y perfiles para avanzar en las automatizaciones (BoT SAC, Bot SAP, Impuesto verde); Catalina está revisando.\nTipo: Otro · Origen: Externo · Módulos: SPR, Impuesto verde · Relacionado: INC-01.', { type: 'incidente', title: 'INC-04 · Faltan credenciales para las automatizaciones', status: 'abierto', ...inModule }),

      // Historial semanal de avance (promedio de módulos) + la Presentación, que no trae esperado.
      ...panels.map((panel) => panelObservation(log, J, PHASE, inModule, panel)),
      log('2026-10-23', 21, J, 'Presentación AurelIA 10-26: 52% real (promedio simple de los 16 módulos; fuente oficial). No informa avance esperado.', { type: 'observacion', title: `Avance ${PHASE} · Presentación ${fmt('2026-10-23')}`, status: null, ...inModule }),
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
      hoursInPhase: realHours.reduce((sum, entry) => sum + Number(entry.hours), 0),
      manualPhasesRemoved,
      manualObservationsRemoved,
    };
  });
}

/** Borra el clon "AurelIA - Administración carga" con sus horas copiadas. */
export async function deleteAdministracionPreview(db: Pick<Database, 'delete'>): Promise<void> {
  await deletePreviewProject(db, ids('preview').previewProject);
}
