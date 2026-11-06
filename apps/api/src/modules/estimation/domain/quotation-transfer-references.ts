import type { AppliedQuotationPlanning, QuotationDraftData } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';

type Target = { moduleId: string; name: string; totalHours: number };
type Result = Pick<AppliedQuotationPlanning, 'modules' | 'unassignedTasks'>;
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-CL').replace(/\s+/g, ' ').trim();
/** El nombre visible de una fase puede venir prefijado: "S2 · Desarrollo".
 * La identidad de su etapa se mantiene en `stageCode`, sin coincidencias parciales.
 */
const phaseTitle = (name: string) => normalize(name)
  .replace(/^(?:[a-z0-9]+(?:-[a-z0-9]+)+|s\d+|fase\s*\d+)\s*·\s*/, '')
  .replace(/^(?:s\d+|fase\s*\d+)\s*[.:\-–]\s*/, '');
const phasePrefix = (name: string) => {
  const value = normalize(name);
  // Los guiones son parte del identificador de etapa (STG-01, TL-GOV);
  // únicamente « · » lo separa del nombre visible de la fase.
  const centered = value.match(/^(.+?)\s*·\s*.+$/);
  if (centered) return centered[1]!.trim();
  return value.match(/^(?:s\d+|fase\s*\d+)\s*[.:–]\s*/)?.[0]?.trim().replace(/[.:–]$/, '').trim() ?? null;
};

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
    const stageName = stages.get(row.stageCode ?? '');
    // Vincula SOLO una fase inequívoca: por código del tramo comercial, por
    // nombre del tramo o por nombre del módulo, quitando el prefijo visual S1 ·.
    // No asume posición ni inventa fases; lo ambiguo se revisa manualmente.
    const matches = targets.filter((target) => {
      const title = phaseTitle(target.name);
      return (row.stageCode !== null && phasePrefix(target.name) === normalize(row.stageCode)) ||
        (stageName !== undefined && title === phaseTitle(stageName)) ||
        title === phaseTitle(row.module);
    });
    const task = {
      wbs: row.wbs, name: row.name, description: row.description,
      role: row.role, hours: row.hours,
      ...(row.teamId ? { teamId: row.teamId } : {}),
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


/**
 * Una copia manual elimina aiPoc.edt. Solo recuperamos referencias de su
 * versión IA de origen si los equipos, fases, HH y semanas siguen intactos.
 * Esto es únicamente visual: no escribe tareas operativas ni modifica
 * una cotización aprobada. Cambios comerciales requieren conciliación humana.
 */
export function matchingCopiedQuotationReferenceSource(
  copied: QuotationDraftData,
  source: QuotationDraftData,
  copiedTotalHours: number,
  sourceTotalHours: number,
): boolean {
  if (!source.aiPoc?.edt || source.aiPoc.source !== 'drive' ||
      source.aiPoc.edt.source !== 'drive' ||
      source.aiPoc.edt.provider !== 'gemini' ||
      copied.aiPoc?.edt || copied.mode !== 'phases' || source.mode !== 'phases' ||
      !Number.isFinite(copiedTotalHours) || !Number.isFinite(sourceTotalHours) ||
      Math.abs(copiedTotalHours - sourceTotalHours) > 0.011 ||
      Math.abs(source.aiPoc.edt.totalHours - sourceTotalHours) > 0.011) {
    return false;
  }
  const teamIds = (draft: QuotationDraftData) =>
    draft.teams.map((team) => team.teamId).sort();
  if (JSON.stringify(teamIds(copied)) !== JSON.stringify(teamIds(source))) return false;
  const phases = (draft: QuotationDraftData) => draft.phases.map((phase) => ({
    name: normalize(phase.name),
    startWeek: phase.startWeek,
    durationWeeks: phase.durationWeeks,
    teamHours: phase.teamHours.map((item) => ({
      teamId: item.teamId, hours: item.hours,
    })).sort((a, b) => a.teamId.localeCompare(b.teamId)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(phases(copied)) === JSON.stringify(phases(source));
}
