import type { ProjectDetail } from '@kora/contracts';
import {
  currentChileDate, getLinkedBlockTasks, indexTeamBlockProgress,
  type TeamBlockProgress,
} from './team-progress';

/**
 * Fuente única del porcentaje operacional en la ficha interna del proyecto.
 * Cada bloque se calcula con la MISMA función que Avance del equipo y el Gantt;
 * esta función solo suma sus HH por fase y por proyecto, sin promediar %.
 */
export interface ProjectExecutionBlock extends TeamBlockProgress {
  readonly teamId: string;
  readonly teamName: string;
  readonly closedAt: string | null;
  readonly approvedDelivery: boolean;
  /** Puntos porcentuales que este bloque resta al proyecto completo. */
  readonly gapPoints: number;
}

export interface ProjectExecutionPhase {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly estimatedHours: number;
  readonly commercialHours: number;
  readonly actualHours: number;
  readonly expectedHours: number;
  readonly consumedHours: number;
  readonly actualPercent: number | null;
  readonly expectedPercent: number | null;
  readonly blocks: readonly ProjectExecutionBlock[];
}

export interface ProjectExecutionProgress {
  readonly hasPlan: boolean;
  readonly plannedHours: number;
  readonly actualHours: number;
  readonly expectedHours: number;
  readonly actualPercent: number | null;
  readonly expectedPercent: number | null;
  readonly soldHours: number;
  readonly usedHours: number;
  readonly consumptionPercent: number | null;
  readonly paused: boolean;
  readonly unplannedBlockCount: number;
  readonly unlinkedTaskCount: number;
  readonly blocksCount: number;
  readonly taskCount: number;
  readonly phases: readonly ProjectExecutionPhase[];
  readonly laggingBlocks: readonly (ProjectExecutionBlock & { phaseName: string })[];
}

const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.max(0, Math.min(100, Math.round(100 * part / whole))) : 0;

const sum = <T>(items: readonly T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0);

type ProgressSource = Pick<ProjectDetail,
  'modules' | 'teams' | 'members' | 'status' | 'stopsClock' | 'soldHours' | 'usedHours'>;

export function calculateProjectExecutionProgress(
  project: ProgressSource, today = currentChileDate(),
): ProjectExecutionProgress {
  const metrics = indexTeamBlockProgress(project, today);
  const plannedHours = sum(project.modules.flatMap((module) => module.segments),
    (segment) => Math.max(0, segment.estimatedHours ?? 0));
  let unplannedBlockCount = 0;
  let unlinkedTaskCount = 0;
  const phases: ProjectExecutionPhase[] = [];

  for (const [index, module] of project.modules.entries()) {
    const matchedTaskIds = new Set<string>();
    const blocks: ProjectExecutionBlock[] = module.segments.map((segment) => {
      const detail = metrics.get(segment.id);
      if (!detail) {
        // Impide publicar porcentajes desde otro modelo si el índice no pudo
        // encontrar el bloque. La ausencia debe quedar visible como sin plan.
        unplannedBlockCount++;
        return {
          id: segment.id, name: segment.name,
          teamId: segment.teamId, teamName: segment.teamName,
          estimatedHours: 0, actualHours: 0, expectedHours: 0,
          consumedHours: segment.consumedHours ?? 0,
          actualPercent: 0, expectedPercent: 0, coveragePercent: 0,
          isClosed: false, pendingApprovalCount: 0, overdueCount: 0, unassignedCount: 0,
          closedAt: segment.closedAt ?? null, approvedDelivery: false, gapPoints: 0,
        };
      }
      if (detail.estimatedHours <= 0) unplannedBlockCount++;
      for (const task of getLinkedBlockTasks(module, segment)) matchedTaskIds.add(task.id);
      const approvedDelivery = module.deliveries.some(
        (delivery) => delivery.segmentId === segment.id && delivery.status === 'approved');
      return {
        ...detail, teamId: segment.teamId, teamName: segment.teamName,
        closedAt: segment.closedAt ?? null, approvedDelivery,
        // Mantener precisión interna: redondear a enteros por bloque podía
        // ocultar TODAS las causas cuando el proyecto apenas lleva 1% esperado.
        // Solo se formatea el número al mostrarlo en la interfaz.
        gapPoints: plannedHours > 0
          ? Math.max(0, 100 * (detail.expectedHours - detail.actualHours) / plannedHours)
          : 0,
      };
    });
    unlinkedTaskCount += module.tasks.filter(
      (task) => !task.cancelledAt && !matchedTaskIds.has(task.id)).length;

    const estimatedHours = sum(blocks, (block) => block.estimatedHours);
    const actualHours = sum(blocks, (block) => block.actualHours);
    const expectedHours = sum(blocks, (block) => block.expectedHours);
    phases.push({
      id: module.id, number: index + 1, name: module.name,
      commercialHours: module.estimatedHours ?? 0,
      estimatedHours, actualHours, expectedHours,
      consumedHours: sum(blocks, (block) => block.consumedHours),
      actualPercent: estimatedHours > 0 ? percent(actualHours, estimatedHours) : null,
      expectedPercent: estimatedHours > 0 ? percent(expectedHours, estimatedHours) : null,
      blocks,
    });
  }

  const actualHours = sum(phases, (phase) => phase.actualHours);
  const expectedHours = sum(phases, (phase) => phase.expectedHours);
  const hasPlan = plannedHours > 0;
  const soldHours = project.soldHours;
  const usedHours = project.usedHours;
  return {
    hasPlan, plannedHours, actualHours, expectedHours,
    actualPercent: hasPlan ? percent(actualHours, plannedHours) : null,
    expectedPercent: hasPlan ? percent(expectedHours, plannedHours) : null,
    soldHours, usedHours,
    consumptionPercent: soldHours > 0 ? percent(usedHours, soldHours) : null,
    paused: project.status === 'on_hold' && project.stopsClock,
    unplannedBlockCount, unlinkedTaskCount,
    blocksCount: project.modules.reduce((count, module) => count + module.segments.length, 0),
    taskCount: project.modules.reduce((count, module) =>
      count + module.tasks.filter((task) => !task.cancelledAt).length, 0),
    phases,
    laggingBlocks: phases.flatMap((phase) => phase.blocks
      .filter((block) => block.gapPoints > 0)
      .map((block) => ({ ...block, phaseName: phase.name })))
      .sort((a, b) => b.gapPoints - a.gapPoints),
  };
}
