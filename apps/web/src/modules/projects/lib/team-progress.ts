import type { ProjectDetail, ProjectModule, ProjectModuleTask, ProjectModuleSegment } from '@kora/contracts';

/**
 * Progreso propio de un equipo. El denominador son las HH de sus bloques
 * operativos; ni las HH del proyecto completo ni el consumo determinan avance.
 *
 * Las horas aprobadas se asocian por segmentId (o por marcador histórico ID).
 * Para tareas legacy sin bloque explícito solo se infiere la asociación cuando
 * el equipo tiene exactamente un bloque en esa fase. No se prorratea el mismo
 * trabajo entre múltiples bloques.
 */
export interface TeamBlockProgress {
  readonly id: string;
  readonly name: string;
  readonly estimatedHours: number;
  readonly actualHours: number;
  readonly expectedHours: number;
  /** HH aprobadas imputadas por la FK real de cada bloque. */
  readonly consumedHours: number;
  readonly actualPercent: number;
  readonly expectedPercent: number;
  readonly coveragePercent: number;
  readonly isClosed: boolean;
  readonly pendingApprovalCount: number;
  readonly overdueCount: number;
  readonly unassignedCount: number;
}

export interface TeamPhaseProgress {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly estimatedHours: number;
  readonly actualHours: number;
  readonly expectedHours: number;
  /** HH aprobadas imputadas por la FK real de cada bloque. */
  readonly consumedHours: number;
  readonly actualPercent: number;
  readonly expectedPercent: number;
  /** Diferencia en puntos porcentuales del avance TOTAL del equipo. */
  readonly gapPoints: number;
  readonly pendingApprovalCount: number;
  readonly overdueCount: number;
  readonly unassignedCount: number;
  readonly blocks: readonly TeamBlockProgress[];
}

export interface TeamProgress {
  readonly hasPlan: boolean;
  readonly plannedHours: number;
  readonly actualHours: number;
  readonly expectedHours: number;
  readonly actualPercent: number | null;
  readonly expectedPercent: number | null;
  readonly consumedHours: number;
  readonly consumptionPercent: number | null;
  readonly assignedHours: number;
  readonly unplannedBlockCount: number;
  readonly unlinkedTaskCount: number;
  readonly paused: boolean;
  readonly phases: readonly TeamPhaseProgress[];
}

export const currentChileDate = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

const percent = (numerator: number, denominator: number): number =>
  denominator > 0 ? Math.max(0, Math.min(100, Math.round(numerator * 100 / denominator))) : 0;

const validHours = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value > 0 ? value : 0;

const utcDate = (value: string) => {
  const timestamp = Date.parse(value.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(timestamp) ? timestamp : null;
};

const DAY_MS = 86_400_000;

/** Plan lineal por días calendario, inclusivos, como el Gantt operativo. */
function expectedBlockHours(block: ProjectModuleSegment, today: string): number {
  const hours = validHours(block.estimatedHours);
  const start = utcDate(block.startDate);
  const end = utcDate(block.endDate);
  const current = utcDate(today);
  if (start === null || end === null || current === null || end < start) return 0;
  if (current < start) return 0;
  if (current >= end) return hours;
  const duration = (end - start) / DAY_MS + 1;
  const elapsed = (current - start) / DAY_MS + 1;
  return hours * elapsed / duration;
}

function belongsToBlock(
  task: ProjectModuleTask, block: ProjectModuleSegment, blocksInTeamPhase: readonly ProjectModuleSegment[],
): boolean {
  if (task.segmentId) return task.segmentId === block.id;
  // Las tareas de integraciones anteriores codificaron el UUID del bloque en la descripción.
  const marker = task.description?.match(/ · ID ([0-9a-fA-F-]{36})/);
  if (marker) return marker[1]?.toLowerCase() === block.id.toLowerCase();
  return blocksInTeamPhase.length === 1;
}

/** Mismo vínculo que usa el avance del equipo: no cuenta canceladas ni tareas de otros equipos. */
export function getLinkedBlockTasks(
  module: Pick<ProjectModule, 'segments' | 'tasks'>, block: ProjectModuleSegment,
): ProjectModuleTask[] {
  const teamBlocks = module.segments.filter((item) => item.teamId === block.teamId);
  return module.tasks.filter((task) =>
    task.teamId === block.teamId && !task.cancelledAt && belongsToBlock(task, block, teamBlocks));
}

/** Métrica del Roadmap: sin presupuesto operativo no se publica un porcentaje artificial. */
export function roadmapBlockMetrics(
  block: TeamBlockProgress | undefined,
): { hours: number | null; progress: number | null } {
  if (!block || block.estimatedHours <= 0) return { hours: null, progress: null };
  return { hours: block.estimatedHours, progress: block.actualPercent };
}

function blockDetail(
  block: ProjectModuleSegment, tasks: readonly ProjectModuleTask[], isDelivered: boolean, today: string,
): TeamBlockProgress {
  const estimatedHours = validHours(block.estimatedHours);
  const approvedHours = tasks
    .filter((task) => task.status === 'done')
    .reduce((sum, task) => sum + validHours(task.estimatedHours), 0);
  const assignedTasksHours = tasks.reduce((sum, task) => sum + validHours(task.estimatedHours), 0);
  // Cierre manual/automático o entrega APROBADA. Una entrega solo 'delivered'
  // espera revisión y todavía no debe cerrar automáticamente el bloque.
  const isClosed = Boolean(block.closedAt) || isDelivered;
  const actualHours = isClosed ? estimatedHours : Math.min(estimatedHours, approvedHours);
  const expectedHours = expectedBlockHours(block, today);
  return {
    id: block.id,
    name: block.name,
    estimatedHours,
    actualHours,
    expectedHours,
    consumedHours: block.consumedHours ?? 0,
    actualPercent: percent(actualHours, estimatedHours),
    expectedPercent: percent(expectedHours, estimatedHours),
    coveragePercent: percent(assignedTasksHours, estimatedHours),
    isClosed,
    pendingApprovalCount: tasks.filter((task) => task.status === 'in_review').length,
    overdueCount: tasks.filter((task) => task.status !== 'done' && task.date < today).length,
    unassignedCount: tasks.filter((task) => !task.assigneeUserId).length,
  };
}

export function calculateTeamProgress(
  project: Pick<ProjectDetail, 'modules' | 'teams' | 'members' | 'status' | 'stopsClock'>,
  teamId: string,
  today = currentChileDate(),
): TeamProgress {
  const assignedHours = project.teams.find((team) => team.teamId === teamId)?.assignedHours ?? 0;
  // Las HH de un colaborador bloqueado siguen siendo un costo histórico del equipo.
  const consumedHours = project.members.filter((member) => member.teamId === teamId)
    .reduce((sum, member) => sum + member.consumedHours, 0);
  let unplannedBlockCount = 0;
  let unlinkedTaskCount = 0;
  const phases: TeamPhaseProgress[] = [];

  for (const [index, module] of project.modules.entries()) {
    const teamBlocks = module.segments.filter((block) => block.teamId === teamId);
    if (teamBlocks.length === 0) continue;

    const tasks = module.tasks.filter((task) => task.teamId === teamId && !task.cancelledAt);
    const matched = new Set<string>();
    const blocks = teamBlocks.map((block) => {
      if (!validHours(block.estimatedHours)) unplannedBlockCount++;
      const linkedTasks = getLinkedBlockTasks(module, block);
      linkedTasks.forEach((task) => matched.add(task.id));
      const approvedDelivery = module.deliveries.some(
        (delivery) => delivery.segmentId === block.id && delivery.status === 'approved',
      );
      return blockDetail(block, linkedTasks, approvedDelivery, today);
    });
    unlinkedTaskCount += tasks.filter((task) => !matched.has(task.id)).length;

    const estimatedHours = blocks.reduce((sum, block) => sum + block.estimatedHours, 0);
    const actualHours = blocks.reduce((sum, block) => sum + block.actualHours, 0);
    const expectedHours = blocks.reduce((sum, block) => sum + block.expectedHours, 0);
    const consumedHoursInBlocks = blocks.reduce((sum, block) => sum + block.consumedHours, 0);
    phases.push({
      id: module.id, number: index + 1, name: module.name,
      estimatedHours, actualHours, expectedHours, consumedHours: consumedHoursInBlocks,
      actualPercent: percent(actualHours, estimatedHours),
      expectedPercent: percent(expectedHours, estimatedHours),
      gapPoints: 0,
      pendingApprovalCount: blocks.reduce((sum, block) => sum + block.pendingApprovalCount, 0),
      overdueCount: blocks.reduce((sum, block) => sum + block.overdueCount, 0),
      unassignedCount: blocks.reduce((sum, block) => sum + block.unassignedCount, 0),
      blocks,
    });
  }

  const plannedHours = phases.reduce((sum, phase) => sum + phase.estimatedHours, 0);
  const actualHours = phases.reduce((sum, phase) => sum + phase.actualHours, 0);
  const expectedHours = phases.reduce((sum, phase) => sum + phase.expectedHours, 0);
  return {
    hasPlan: plannedHours > 0,
    plannedHours, actualHours, expectedHours,
    actualPercent: plannedHours > 0 ? percent(actualHours, plannedHours) : null,
    expectedPercent: plannedHours > 0 ? percent(expectedHours, plannedHours) : null,
    assignedHours, consumedHours,
    consumptionPercent: assignedHours > 0 ? percent(consumedHours, assignedHours) : null,
    unplannedBlockCount, unlinkedTaskCount,
    paused: project.status === 'on_hold' && project.stopsClock,
    phases: phases.map((phase) => ({
      ...phase,
      gapPoints: plannedHours > 0
        ? Math.max(0, Math.round(100 * (phase.expectedHours - phase.actualHours) / plannedHours)) : 0,
    })),
  };
}

/**
 * Un único índice por bloque para Roadmap y drawer operativo. Los porcentajes
 * provienen de calculateTeamProgress, no de tareas aprobadas / tareas cargadas.
 */
export function indexTeamBlockProgress(
  project: Pick<ProjectDetail, 'modules' | 'teams' | 'members' | 'status' | 'stopsClock'>,
  today = currentChileDate(),
): ReadonlyMap<string, TeamBlockProgress> {
  const teamIds = new Set(project.modules.flatMap((module) =>
    module.segments.map((segment) => segment.teamId)));
  const blocks = new Map<string, TeamBlockProgress>();
  for (const teamId of teamIds) {
    for (const phase of calculateTeamProgress(project, teamId, today).phases) {
      for (const block of phase.blocks) blocks.set(block.id, block);
    }
  }
  return blocks;
}
