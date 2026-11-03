import type { AppliedQuotationPlanning, QuotationDraftData } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';

type Target = { moduleId: string; name: string; totalHours: number };
type Result = Pick<AppliedQuotationPlanning, 'modules' | 'unassignedTasks'>;
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-CL').replace(/\s+/g, ' ').trim();

/** Proyección de SOLO LECTURA. Conserva el Roadmap operativo sin crear
 * project_module_tasks ni project_module_segments con fechas ficticias. */
export function buildQuotationTransferReferences(
  draft: QuotationDraftData,
  targets: readonly Target[],
): Result {
  const stages = new Map<string, string>();
  for (const stage of draft.aiPoc?.edt?.stages ?? []) {
    stages.set(stage.code,
      draft.edtStageSettings?.find((edit) => edit.stageCode === stage.code)?.name ?? stage.name);
  }
  for (const stage of draft.edtCommercialStages ?? []) stages.set(stage.code, stage.name);
  const assignments = draft.aiPoc?.edt ? quotationEdtAssignments(draft) : [];
  const bucket = new Map(targets.map((target) => [target.moduleId, [] as Result['modules'][number]['tasks']]));
  const unassignedTasks: NonNullable<Result['unassignedTasks']> = [];
  for (const row of assignments) {
    const key = normalize(stages.get(row.stageCode ?? '') ?? row.module);
    const direct = targets.filter((target) => normalize(target.name) === key);
    // En EDT v1 el nombre del módulo es más fiable que un tramo inexistente.
    const legacy = direct.length === 0 ? targets.filter((target) =>
      normalize(target.name) === normalize(row.module)) : [];
    const matches = direct.length ? direct : legacy;
    const task = {
      wbs: row.wbs, name: row.name, description: row.description,
      role: row.role, hours: row.hours,
      ...(row.stageCode ? { stageCode: row.stageCode } : {}),
      ...(row.references.length ? { referenceIds: row.references } : {}),
    };
    if (matches.length === 1) bucket.get(matches[0]!.moduleId)!.push(task);
    else unassignedTasks.push(task);
  }
  return {
    modules: targets.map((target) => {
      const phase = draft.phases.filter((row) => normalize(row.name) === normalize(target.name));
      const blocks = phase.length === 1 ? phase[0]!.teamHours
        .filter((row) => row.hours > 0)
        .map((row) => ({
          teamId: row.teamId, hours: row.hours,
          startWeek: phase[0]!.startWeek,
          durationWeeks: phase[0]!.durationWeeks,
        })) : [];
      return {
        moduleId: target.moduleId,
        name: target.name, totalHours: target.totalHours,
        tasks: bucket.get(target.moduleId) ?? [],
        relativeTeamBlocks: blocks,
      };
    }),
    unassignedTasks,
  };
}
