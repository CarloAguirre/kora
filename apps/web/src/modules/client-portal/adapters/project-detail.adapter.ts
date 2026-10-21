import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  projectDelayLevel,
  type HourEntryStatus,
  type HourEntrySummary,
  type ProjectDetail,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleDeliveryStatus,
  type ProjectModuleTask,
  type ProjectObservation,
} from '@kora/contracts';
import { getTeamStyle } from '@/modules/projects/utils/team-style';
import { toBitacoraRows, type BitacoraRow } from '@/modules/projects/lib/bitacora-row';
import { entryTitle, EVENT_STATUS_LABEL } from '@/modules/projects/lib/hour-entry-log';
import { lifecycleHealth } from './portal-list.adapter';
import type {
  ClientBitacoraEntry,
  ClientBitacoraEntryKind,
  ClientBitacoraStatusTone,
  ClientProjectBilling,
  ClientProjectDetail,
  ClientProjectHealth,
  ClientRoadmapPhase,
  PhaseRoadmapDelivery,
  PhaseRoadmapDeliveryState,
  PhaseRoadmapPhase,
  PhaseRoadmapRole,
  PhaseRoadmapTaskItem,
  PhaseRoadmapTaskScope,
  ProjectPhaseRoadmap,
  RoadmapStep,
} from '../types';

/**
 * Traduce el `ProjectDetail` real (`@kora/contracts`, `GET /projects/:id`) a
 * la forma que ya consumen las vistas del portal de cliente
 * (`ClientProjectDetailPage.tsx` y sus componentes) — ver
 * `docs/DECISION-PORTAL-CLIENTE.md`. Las vistas no cambian: solo se reemplaza
 * el origen de los datos, siguiendo el mismo criterio de derivación que ya
 * usa `ProjectModulesCard` (Roadmap del módulo interno) para fase/entrega/
 * tarea a partir de fechas — ver `phaseVisualStatus`/`deliveryVisualStatus`/
 * `taskVisualStatus` ahí.
 *
 * Huecos de datos reales (documentados en vez de fingidos):
 * - `project_module_deliveries` no guarda un nombre/descripción propio — la
 *   etiqueta de cada entrega se arma con el equipo responsable.
 * - Las entradas de bitácora no llevan hora, solo fecha (`project_observations.date`
 *   es `date`, no `timestamp`) — la hora que se muestra viene de `createdAt`.
 * - "Hoja de ruta" (el mini-pipeline de 5 pasos) no tiene un % de avance
 *   propio guardado: se aproxima con la fracción de tiempo transcurrido
 *   dentro del rango estimado de la fase.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function formatDMY(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = toDate(iso);
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function formatTimeOfDay(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Instante (no solo fecha) en hora local — "05-10-2026, 02:30 p. m.", mismo formato que las entradas de bitácora. */
function formatDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  const dmy = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  return `${dmy}, ${formatTimeOfDay(isoDateTime)}`;
}

export function roleFromTeamName(teamName: string | null): PhaseRoadmapRole {
  const sigla = getTeamStyle(teamName ?? '').sigla.toUpperCase();
  if (sigla === 'QA') return 'qa';
  if (sigla === 'IA') return 'ia';
  if (sigla === 'UX') return 'ux';
  if (sigla === 'RPA') return 'rpa';
  return 'dev';
}

/** Los tramos no guardan ámbito propio (solo el equipo), así que se deriva del rol: UX → Diseño,
 *  QA → QA Funcional y el resto → Desarrollo. Ningún tramo cae en "Rev. Cliente". Es lo que
 *  permite que los chips de "Resumen de avance" también filtren las barras del Gantt. */
const SCOPE_BY_ROLE: Readonly<Record<PhaseRoadmapRole, PhaseRoadmapTaskScope>> = {
  ux: 'diseno',
  qa: 'qa',
  dev: 'desarrollo',
  ia: 'desarrollo',
  rpa: 'desarrollo',
};

/**
 * Mismo criterio que `phaseVisualStatus` de `ProjectModulesCard`: "finished" es 100% la decisión
 * manual del líder (`currentStage === 'closed'`), no se calcula desde las tareas; "upcoming"/
 * "in_progress" sí se derivan de ellas.
 */
function phaseStatus(module: ProjectModule): PhaseRoadmapPhase['status'] {
  if (module.currentStage === 'closed') return 'finished';
  if (module.tasks.length === 0) return 'upcoming';
  const today = startOfToday();
  const anyStarted = module.tasks.some((task) => toDate(task.startDate ?? task.date) <= today);
  return anyStarted ? 'in_progress' : 'upcoming';
}

function deliveryState(delivery: ProjectModuleDelivery): PhaseRoadmapDeliveryState {
  if (delivery.status === 'delivered' || delivery.status === 'approved') return 'delivered';
  return toDate(delivery.estimatedDate) < startOfToday() ? 'delayed' : 'committed';
}

function taskItemState(task: ProjectModuleTask): PhaseRoadmapTaskItem['state'] {
  if (task.status === 'done') return 'done';
  return toDate(task.date) < startOfToday() ? 'delayed' : 'upcoming';
}

function deliveryLabel(delivery: ProjectModuleDelivery): string {
  if (delivery.name) return delivery.name;
  return delivery.teamName ? `Entrega ${delivery.teamName}` : 'Entrega';
}

const OBSERVATION_STATUS_LABELS: Record<string, string> = {
  abierto: 'Abierto',
  resuelto: 'Resuelto',
  pendiente: 'Pendiente',
  cumplido: 'Completado',
  activo: 'Iniciado',
};

const OBSERVATION_STATUS_TONES: Record<string, ClientBitacoraStatusTone> = {
  abierto: 'danger',
  resuelto: 'success',
  pendiente: 'warning',
  cumplido: 'success',
  activo: 'info',
};

function observationKind(observation: ProjectObservation): ClientBitacoraEntryKind {
  if (observation.type === 'hito') return 'milestone';
  if (observation.type === 'incidente' || observation.type === 'atencion') return 'attention';
  if (observation.type === 'compromiso') return observation.status === 'cumplido' ? 'completed' : 'pending';
  return 'marked';
}

function toBitacoraEntry(observation: ProjectObservation, moduleBadgeByModuleId: ReadonlyMap<string, string>): ClientBitacoraEntry {
  const status = observation.status ?? 'activo';
  return {
    id: observation.id,
    kind: observationKind(observation),
    title: observation.title ?? observation.message.slice(0, 80),
    registeredByName: observation.authorName,
    registeredAt: `${formatDMY(observation.date)}, ${formatTimeOfDay(observation.createdAt)}`,
    phaseTag:
      observation.moduleId && observation.moduleName
        ? `${moduleBadgeByModuleId.get(observation.moduleId) ?? ''} - ${observation.moduleName}`
        : null,
    description: observation.message,
    statusLabel: OBSERVATION_STATUS_LABELS[status] ?? 'Registrado',
    statusTone: OBSERVATION_STATUS_TONES[status] ?? 'info',
  };
}

const EVENT_STATUS_TONES: Record<HourEntryStatus, ClientBitacoraStatusTone> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
};

/**
 * El cliente no ve la revisión interna: para él, `delivered` es "Entregada" — no el "Pendiente de
 * aprobación" que ve el equipo (`PROJECT_MODULE_DELIVERY_STATUS_LABELS`).
 */
const CLIENT_DELIVERY_STATUS_LABELS: Record<ProjectModuleDeliveryStatus, string> = {
  ...PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  delivered: 'Entregada',
};

const DELIVERY_STATUS_TONES: Record<ProjectModuleDeliveryStatus, ClientBitacoraStatusTone> = {
  planned: 'warning',
  delivered: 'info',
  approved: 'success',
};

function phaseTagFor(moduleId: string | null | undefined, moduleName: string | null | undefined, moduleBadgeByModuleId: ReadonlyMap<string, string>): string | null {
  return moduleId && moduleName ? `${moduleBadgeByModuleId.get(moduleId) ?? ''} - ${moduleName}` : null;
}

/** Misma fila que la Bitácora interna (`toBitacoraRows`: horas registradas + registros manuales + entregas de fase), en la forma del feed del portal. */
function rowToBitacoraEntry(row: BitacoraRow, moduleBadgeByModuleId: ReadonlyMap<string, string>): ClientBitacoraEntry {
  if (row.kind === 'evento') {
    const { entry } = row;
    const description = [entry.description, entry.hasBlocker ? `Bloqueo: ${entry.blockerDescription ?? 'sin detalle'}` : null]
      .filter(Boolean)
      .join(' — ');
    return {
      id: entry.id,
      kind: entry.hasBlocker ? 'attention' : 'marked',
      title: entryTitle(entry),
      registeredByName: entry.user.fullName,
      registeredAt: `${formatDMY(entry.date)}, ${formatTimeOfDay(entry.createdAt)}`,
      phaseTag: phaseTagFor(entry.module?.id, entry.module?.name, moduleBadgeByModuleId),
      description,
      statusLabel: EVENT_STATUS_LABEL[entry.status],
      statusTone: EVENT_STATUS_TONES[entry.status],
    };
  }
  if (row.kind === 'entrega') {
    const { delivery } = row;
    return {
      id: delivery.id,
      kind: delivery.status === 'planned' ? 'pending' : 'completed',
      title: `Entrega de fase: ${row.moduleName}`,
      registeredByName: delivery.teamName ?? '—',
      registeredAt: formatDMY(delivery.estimatedDate),
      phaseTag: phaseTagFor(row.moduleId, row.moduleName, moduleBadgeByModuleId),
      description: deliveryLabel(delivery),
      statusLabel: CLIENT_DELIVERY_STATUS_LABELS[delivery.status],
      statusTone: DELIVERY_STATUS_TONES[delivery.status],
    };
  }
  return toBitacoraEntry(row.observation, moduleBadgeByModuleId);
}

function toPhaseRoadmapPhase(
  module: ProjectModule,
  index: number,
  observationsByModule: ReadonlyMap<string, ProjectObservation[]>,
  moduleBadgeByModuleId: ReadonlyMap<string, string>,
): PhaseRoadmapPhase {
  const badge = `FASE ${index + 1}`;
  const delayedDeliveries = module.deliveries.filter((delivery) => deliveryState(delivery) === 'delayed').length;
  const alertLabel =
    module.blockerCount > 0
      ? `${module.blockerCount} incidente${module.blockerCount > 1 ? 's' : ''}`
      : delayedDeliveries > 0
        ? `${delayedDeliveries} atraso${delayedDeliveries > 1 ? 's' : ''}`
        : null;

  return {
    id: module.id,
    badge,
    name: module.name,
    status: phaseStatus(module),
    alertLabel,
    tasks: module.segments.map((segment) => {
      const role = roleFromTeamName(segment.teamName);
      return {
        id: segment.id,
        role,
        scope: SCOPE_BY_ROLE[role],
        label: segment.name,
        startDate: segment.startDate,
        endDate: segment.endDate,
      };
    }),
    deliveries: module.deliveries.map(
      (delivery): PhaseRoadmapDelivery => ({
        id: delivery.id,
        label: deliveryLabel(delivery),
        date: delivery.estimatedDate,
        state: deliveryState(delivery),
      }),
    ),
    taskItems: module.tasks.map((task) => ({
      id: task.id,
      label: task.name,
      date: task.date,
      state: taskItemState(task),
      scope: task.scope,
    })),
    scopeProgress: module.progress.scopes,
    /** Más reciente primero: el Roadmap muestra solo el último registro de la
        tarea/entrega seleccionada (ver `filteredBitacora` en `PhaseRoadmap`). */
    relatedBitacora: [...(observationsByModule.get(module.id) ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .map((observation) => toBitacoraEntry(observation, moduleBadgeByModuleId)),
  };
}

/** ISO `YYYY-MM-DD` corrido `days` días (negativo = hacia atrás). */
function shiftIsoDate(iso: string, days: number): string {
  const date = toDate(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * "Roadmap por Fases" del proyecto — lo usan tanto el portal de cliente como el Roadmap interno
 * (`ProjectModulesCard`), así ambas vistas muestran exactamente lo mismo.
 */
export function toPhaseRoadmap(project: ProjectDetail): ProjectPhaseRoadmap {
  const observationsByModule = new Map<string, ProjectObservation[]>();
  for (const observation of project.observations) {
    if (!observation.moduleId) continue;
    const list = observationsByModule.get(observation.moduleId) ?? [];
    list.push(observation);
    observationsByModule.set(observation.moduleId, list);
  }
  const moduleBadgeByModuleId = new Map(project.modules.map((module, index) => [module.id, `FASE ${index + 1}`]));

  const allDates = project.modules.flatMap((module) => [
    ...module.segments.flatMap((s) => [s.startDate, s.endDate]),
    ...module.tasks.flatMap((t) => (t.startDate ? [t.startDate, t.date] : [t.date])),
    ...module.deliveries.map((d) => d.estimatedDate),
  ]);
  const sorted = allDates.length > 0 ? [...allDates].sort() : [project.startDate, project.endDate].filter((v): v is string => Boolean(v));
  const first = sorted[0] ?? project.startDate;
  const last = sorted[sorted.length - 1] ?? project.endDate;

  return {
    phaseCount: project.modules.length,
    teamSegmentCount: project.modules.reduce((sum, m) => sum + m.segments.length, 0),
    plannedDeliveryCount: project.modules.reduce((sum, m) => sum + m.deliveries.length, 0),
    // Una semana de margen a cada lado, como `computeAutoRange` del prototipo
    // (`ficha_proyecto_lider-actualizada.html`): sin ella, lo que cae en la primera/última
    // fecha queda pegado al borde y tapado por la línea de HOY.
    rangeStartDate: first ? shiftIsoDate(first, -7) : '',
    rangeEndDate: last ? shiftIsoDate(last, 7) : '',
    phases: project.modules.map((module, index) =>
      toPhaseRoadmapPhase(module, index, observationsByModule, moduleBadgeByModuleId),
    ),
  };
}

/** "Hoja de ruta": el mini-pipeline de 5 pasos por fase — `currentStage` de la fase YA es este paso (mismo enum, salvo 'closed' → 'finished'). */
function toRoadmapStep(stage: ProjectModule['currentStage']): RoadmapStep {
  return stage === 'closed' ? 'finished' : stage;
}

function toRoadmapPhase(module: ProjectModule, index: number): ClientRoadmapPhase {
  const status = phaseStatus(module);
  const start = module.estimatedStartDate;
  const end = module.estimatedEndDate;

  const months: string[] = [];
  if (start && end) {
    const cursor = toDate(start);
    const last = toDate(end);
    while (months.length < 4 && cursor <= last) {
      months.push(MONTH_LABELS[cursor.getMonth()] ?? 'Enero');
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  while (months.length < 4) months.push(months[months.length - 1] ?? 'Enero');

  let expectedProgressPercent: number | undefined;
  if (status === 'in_progress' && start && end) {
    const startMs = toDate(start).getTime();
    const endMs = toDate(end).getTime();
    const total = endMs - startMs;
    expectedProgressPercent =
      total > 0 ? Math.min(100, Math.max(0, ((startOfToday().getTime() - startMs) / total) * 100)) : 0;
  }

  return {
    name: `Fase ${index + 1} · ${module.name}`,
    status,
    startDate: formatDMY(start),
    endDate: formatDMY(end),
    currentStep: status === 'in_progress' ? toRoadmapStep(module.currentStage) : null,
    months: months.slice(0, 4) as [string, string, string, string],
    expectedProgressPercent,
  };
}

function toBilling(project: ProjectDetail): ClientProjectBilling {
  const milestones = project.paymentMilestones;
  const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
  const sumWhere = (predicate: (status: string) => boolean) =>
    milestones.filter((m) => predicate(m.status)).reduce((sum, m) => sum + m.amount, 0);
  const percentOf = (amount: number) => (totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0);

  const paidAmount = sumWhere((s) => s === 'paid');
  const invoicedAmount = sumWhere((s) => s === 'invoiced');
  // Para el cliente "pendiente de facturar" incluye los tramos cuyo hito aún no se cumple y los ya por facturar.
  const pendingAmount = sumWhere((s) => s === 'pending' || s === 'to_invoice');

  return {
    currency: project.contractCurrency,
    totalAmount,
    paid: { amount: paidAmount, percent: percentOf(paidAmount) },
    invoicedPendingCollection: { amount: invoicedAmount, percent: percentOf(invoicedAmount) },
    pendingToInvoice: { amount: pendingAmount, percent: percentOf(pendingAmount) },
    schedule: milestones.map((milestone) => ({
      tramo: milestone.name,
      // Tramos que no son un % del contrato (p.ej. "Desvío de horas") llegan
      // con `percent: null` desde `project_payment_milestones` — el portal
      // cliente solo muestra el número, así que un tramo sin % se ve como 0%.
      percent: milestone.percent ?? 0,
      amount: milestone.amount,
      invoiceNumber: milestone.invoiceNumber,
      issueDate: milestone.issuedAt ? formatDMY(milestone.issuedAt) : null,
      status: milestone.status === 'paid' ? 'paid' : 'pending',
      paymentDate: milestone.paidAt ? formatDMY(milestone.paidAt) : null,
    })),
  };
}

function health(project: ProjectDetail): ClientProjectHealth {
  const lifecycle = lifecycleHealth(project);
  if (lifecycle) return lifecycle;
  // Mismo umbral que el dashboard y el listado interno (`PROJECT_PROGRESS_DELAY_ALERT`).
  return projectDelayLevel(project.progress.delay) === 'on_track' ? 'active' : 'at_risk';
}

function tag(project: ProjectDetail): string {
  const teamNames = new Set<string>();
  for (const module of project.modules) {
    for (const segment of module.segments) if (segment.teamName) teamNames.add(getTeamStyle(segment.teamName).sigla);
  }
  return teamNames.size > 0 ? [...teamNames].slice(0, 2).join('/') : '—';
}

export function toClientProjectDetail(project: ProjectDetail, hourEntries: readonly HourEntrySummary[] = []): ClientProjectDetail {
  const contactName = project.primaryContact?.name ?? '—';
  const contactPosition = project.primaryContact?.position ?? '';
  const usedHours = project.usedHours;
  const soldHours = project.soldHours;
  const daysRemaining = project.endDate
    ? Math.max(0, Math.round((toDate(project.endDate).getTime() - startOfToday().getTime()) / DAY_MS))
    : 0;

  const impactBefore = {
    totalProcessHours: project.impactBeforeHours ?? 0,
    peopleInvolved: 0,
    cycleDays: 0,
    modality: project.impactBeforeModality ?? '',
  };
  const impactAfter = {
    totalProcessHours: project.impactAfterHours ?? 0,
    peopleInvolved: 0,
    cycleDays: 0,
    modality: project.impactAfterModality ?? '',
  };
  // "Personas involucradas" / "Duración calendario" viajan como texto libre en el contrato
  // (`impactBeforePeople`, no un número) — se muestran tal cual en vez de forzarlas a `number`.
  const parseLeadingNumber = (value: string | null): number => {
    const match = value?.match(/\d+(?:[.,]\d+)?/);
    return match ? Number(match[0].replace(',', '.')) : 0;
  };
  impactBefore.peopleInvolved = parseLeadingNumber(project.impactBeforePeople);
  impactBefore.cycleDays = parseLeadingNumber(project.impactBeforeDuration);
  impactAfter.peopleInvolved = parseLeadingNumber(project.impactAfterPeople);
  impactAfter.cycleDays = parseLeadingNumber(project.impactAfterDuration);
  const reductionPercent =
    impactBefore.totalProcessHours > 0
      ? Math.round((1 - impactAfter.totalProcessHours / impactBefore.totalProcessHours) * 100)
      : 0;

  const moduleBadgeByModuleId = new Map(project.modules.map((module, index) => [module.id, `FASE ${index + 1}`]));

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    health: health(project),
    tag: tag(project),
    company: {
      name: project.client?.companyName ?? '—',
      contactName,
      contactPosition,
    },
    kabeliOwnerName: project.commercialManager?.fullName ?? '—',
    clientContactName: contactName,
    clientContactPosition: contactPosition,
    startDate: formatDMY(project.startDate),
    estimatedHours: soldHours,
    // Solo cuenta como desviación lo consumido por sobre lo vendido (mismo criterio que el dashboard).
    hoursDeviation: Math.round(Math.max(0, usedHours - soldHours) * 10) / 10,
    usedHoursToDate: usedHours,
    usedHoursUpdatedAt: project.usedHoursUpdatedAt ? formatDMY(project.usedHoursUpdatedAt) : '--',
    lastUpdatedAt: project.leaderLastActivityAt ? formatDateTime(project.leaderLastActivityAt) : null,
    progressActualPercent: project.progress.actual,
    progressExpectedPercent: project.progress.expected,
    endDate: formatDMY(project.endDate),
    daysRemaining,
    billing: toBilling(project),
    roadmap: project.modules.map((module, index) => toRoadmapPhase(module, index)),
    phaseRoadmap: toPhaseRoadmap(project),
    bitacora: toBitacoraRows(
      hourEntries,
      project.observations.filter((observation) => !observation.moduleId || moduleBadgeByModuleId.has(observation.moduleId)),
      project.modules,
    ).map((row) => rowToBitacoraEntry(row, moduleBadgeByModuleId)),
    accessLinks: {
      demo: project.demoLink,
      testEnvironment: project.testEnvironmentLink,
      figma: project.figmaLink,
      documentation: project.documentationLink,
    },
    businessImpact: { before: impactBefore, after: impactAfter, reductionPercent },
    qaMetrics:
      project.qaPlannedTests != null
        ? {
            stageLabel: 'QA',
            caption: `${project.qaPlannedTests} pruebas planificadas${project.qaEvaluatedModule ? ` para ${project.qaEvaluatedModule}` : ''}`,
            startDate: formatDMY(project.qaTestingStartDate),
            endDate: formatDMY(project.qaTestingEndDate),
            planned: project.qaPlannedTests,
            executed: project.qaExecutedTests ?? 0,
            withErrors: project.qaFailedTests ?? 0,
            remaining: Math.max(0, project.qaPlannedTests - (project.qaExecutedTests ?? 0)),
          }
        : null,
  };
}
