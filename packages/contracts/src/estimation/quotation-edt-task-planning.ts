import type { QuotationDraftData } from './quotation.contract';
import { effectiveQuotationEdt } from './quotation-edt-adjustments';

type Draft = QuotationDraftData;
type Setting = NonNullable<Draft['edtTaskSettings']>[number];
export type QuotationEdtAssignment = {
  wbs: string; role: string; module: string; stageCode: string | null;
  name: string; description: string; references: string[];
  hours: number; originalHours: number; fixed: boolean;
  teamKey: string; teamId: string | null;
};
const key = (wbs: string, role: string) => JSON.stringify([wbs, role]);
const cents = (hours: number) => Math.round(hours * 100);
const fromCents = (value: number) => Math.round(value) / 100;

/** Identidad comercial: un equipo Kora elegido para la tarea prima sobre el
 * mapeo general del perfil; sin equipo, se conserva el perfil de Gemini. */
export function quotationAssignmentTeamKey(
  draft: Draft, wbs: string, role: string,
): string {
  const task = (draft.edtTaskSettings ?? []).find((item) =>
    item.wbs === wbs && item.role === role);
  return task?.teamId ?? draft.aiPoc?.roleTeamIds[role] ?? 'profile:' + role;
}

/** Relación canónica que alimenta desplegables, totales y redistribuciones.
 * No modifica la EDT; únicamente aplica HH, equipos y protecciones del borrador. */
export function quotationEdtAssignments(draft: Draft): QuotationEdtAssignment[] {
  const edt = effectiveQuotationEdt(draft);
  const overrides = draft.edtTaskSettings ?? [];
  if (!edt) {
    if (overrides.length || (draft.edtRoleCollaborators?.length ?? 0) > 0) {
      throw new Error('No puedes configurar tareas o perfiles sin una EDT de origen.');
    }
    return [];
  }
  const original = draft.aiPoc?.edt;
  if (!original) throw new Error('Falta EDT original.');
  const sourceEffort = new Map<string, number>();
  for (const module of original.modules) for (const task of module.tasks) {
    for (const effort of task.roleEffort ?? [{ role: task.role, hours: task.hours }]) {
      const id = key(task.wbs, effort.role);
      if (sourceEffort.has(id)) {
        throw new Error('La EDT de origen contiene asignaciones WBS/perfil repetidas.');
      }
      sourceEffort.set(id, effort.hours);
    }
  }
  const settings = new Map<string, Setting>();
  const validTeams = new Set(draft.teams.map((team) => team.teamId));
  for (const item of overrides) {
    const id = key(item.wbs, item.role);
    if (!sourceEffort.has(id) || settings.has(id)) {
      throw new Error('Equipo/fijación con WBS y perfil inexistente o duplicado: ' +
        item.wbs + ' / ' + item.role);
    }
    if (item.teamId && !validTeams.has(item.teamId)) {
      throw new Error('El equipo seleccionado para ' + item.wbs +
        ' no pertenece a los equipos de esta cotización.');
    }
    settings.set(id, item);
  }
  const validStages = new Set(edt.schemaVersion === 'kora.quotation.reference-edt.v2'
    ? (edt.stages ?? []).map((stage) => stage.code)
    : edt.modules.map((module) => 'module:' + module.name));
  const seenStages = new Set<string>();
  for (const stage of draft.edtStageSettings ?? []) {
    if (!validStages.has(stage.stageCode) || seenStages.has(stage.stageCode) ||
        stage.startWeek + stage.durationWeeks - 1 > 520) {
      throw new Error('La edición de etapa contiene un tramo inexistente, duplicado o fuera de 520 semanas.');
    }
    seenStages.add(stage.stageCode);
  }
  const roles = new Set(draft.aiPoc?.proposal.roles.map((role) => role.role) ?? []);
  const staffing = new Set<string>();
  for (const item of draft.edtRoleCollaborators ?? []) {
    if (!roles.has(item.role) || staffing.has(item.role)) {
      throw new Error('Colaboradores con perfil de Gemini inexistente o repetido.');
    }
    staffing.add(item.role);
  }
  const rows: QuotationEdtAssignment[] = [];
  for (const module of edt.modules) for (const task of module.tasks) {
    for (const effort of task.roleEffort ?? [{ role: task.role, hours: task.hours }]) {
      const id = key(task.wbs, effort.role);
      const item = settings.get(id);
      rows.push({
        wbs: task.wbs, role: effort.role, module: module.name,
        stageCode: task.stageCode ?? null, name: task.name,
        description: task.description, references: task.referenceIds ?? [],
        hours: effort.hours, originalHours: sourceEffort.get(id) ?? effort.hours,
        fixed: item?.fixed ?? false,
        teamId: item?.teamId ?? draft.aiPoc?.roleTeamIds[effort.role] ?? null,
        teamKey: quotationAssignmentTeamKey(draft, task.wbs, effort.role),
      });
    }
  }
  return rows;
}

/** Protege una tarea o la reasigna a otro equipo. `teamId=null` devuelve la
 * tarea al mapeo general del perfil. El caller debe incluir primero el equipo
 * nuevo en draft.teams; el backend comprueba que sea un equipo conocido. */
export function withQuotationTaskSetting(
  draft: Draft, wbs: string, role: string,
  changes: { fixed?: boolean; teamId?: string | null },
): Draft {
  const target = quotationEdtAssignments(draft).find((row) =>
    row.wbs === wbs && row.role === role);
  if (!target) throw new Error('No existe la asignación WBS/perfil seleccionada.');
  const old = (draft.edtTaskSettings ?? []).find((item) =>
    item.wbs === wbs && item.role === role);
  const existing = (draft.edtTaskSettings ?? []).filter((item) =>
    item.wbs !== wbs || item.role !== role);
  const fixed = changes.fixed ?? old?.fixed ?? false;
  const teamId = changes.teamId === undefined ? old?.teamId :
    changes.teamId === null ? undefined : changes.teamId;
  if (fixed || teamId) existing.push({
    wbs, role, ...(fixed ? { fixed } : {}),
    ...(teamId ? { teamId } : {}),
  });
  const next = { ...draft, edtTaskSettings: existing };
  quotationEdtAssignments(next);
  return next;
}

/** Reparte en centésimos la DIFERENCIA de horas en partes iguales.
 * - Nunca modifica tareas fijas.
 * - Nunca produce tareas con HH <= 0.
 * - Si alguna tarea llega a 0,01 HH, reparte el remanente entre las demás.
 * - El centésimo sobrante va, de forma determinística, por orden WBS/perfil.
 * La operación es atómica: o todas las HH concilian o se lanza un error.
 */
export function redistributeQuotationEdtHours(
  draft: Draft,
  { teamKey, stageCode, module, targetHours }: {
    teamKey: string;
    stageCode?: string;
    module?: string;
    targetHours: number;
  },
): Draft {
  if (!Number.isFinite(targetHours) || targetHours < 0 ||
      targetHours > 1000000 || cents(targetHours) !== targetHours * 100 &&
      Math.abs(fromCents(cents(targetHours)) - targetHours) > 0.00000001) {
    throw new Error('Ingresa un total HH válido, con máximo dos decimales.');
  }
  const selected = quotationEdtAssignments(draft).filter((row) =>
    row.teamKey === teamKey &&
    (stageCode === undefined || row.stageCode === stageCode) &&
    (module === undefined || row.module === module))
    .sort((a, b) => a.wbs.localeCompare(b.wbs) || a.role.localeCompare(b.role));
  if (!selected.length) throw new Error('No existen tareas para ese equipo en el tramo.');
  const current = selected.reduce((sum, row) => sum + cents(row.hours), 0);
  const target = cents(targetHours);
  if (current === target) return draft;
  const fixed = selected.filter((row) => row.fixed)
    .reduce((sum, row) => sum + cents(row.hours), 0);
  const flexible = selected.filter((row) => !row.fixed);
  if (!flexible.length) {
    throw new Error('No hay tareas editables: todas están marcadas como Fija.');
  }
  if (target < fixed + flexible.length) {
    throw new Error('Las HH solicitadas son menores que las tareas fijas más ' +
      'el mínimo de 0,01 HH por cada tarea editable.');
  }
  const amounts = flexible.map((row) => cents(row.hours));
  let delta = target - current;
  if (delta > 0) {
    // Distribución equilibrada e independiente de la precisión flotante.
    const each = Math.floor(delta / amounts.length);
    const extra = delta % amounts.length;
    amounts.forEach((value, i) => { amounts[i] = value + each + (i < extra ? 1 : 0); });
  } else {
    let remaining = -delta;
    let active = amounts.map((_, i) => i).filter((i) => amounts[i]! > 1);
    while (remaining > 0 && active.length > 0) {
      const share = Math.floor(remaining / active.length);
      const leftover = remaining % active.length;
      let removed = 0;
      active.forEach((i, rank) => {
        const decrease = Math.min(amounts[i]! - 1, share + (rank < leftover ? 1 : 0));
        amounts[i] = amounts[i]! - decrease;
        removed += decrease;
      });
      if (removed === 0) break;
      remaining -= removed;
      active = active.filter((i) => amounts[i]! > 1);
    }
    if (remaining !== 0) throw new Error('No hay HH redistribuibles suficientes.');
  }
  const changed = new Map<string, number>();
  flexible.forEach((row, i) => changed.set(key(row.wbs, row.role), fromCents(amounts[i]!)));
  const retained = (draft.edtHourAdjustments ?? []).filter((item) =>
    !changed.has(key(item.wbs, item.role)));
  for (const row of flexible) {
    const hours = changed.get(key(row.wbs, row.role))!;
    if (cents(hours) !== cents(row.originalHours)) {
      retained.push({ wbs: row.wbs, role: row.role, hours });
    }
  }
  const next = { ...draft, edtHourAdjustments: retained };
  const updated = quotationEdtAssignments(next);
  const calculated = updated.filter((row) =>
    row.teamKey === teamKey &&
    (stageCode === undefined || row.stageCode === stageCode) &&
    (module === undefined || row.module === module))
    .reduce((sum, row) => sum + cents(row.hours), 0);
  if (calculated !== target) throw new Error('Las HH redistribuidas no concilian.');
  return next;
}

/** Edita nombre y semanas SIN alterar las fechas originales de Gemini.
 * Rechaza periodos fuera del horizonte y etapas inexistentes. */
export function withQuotationEdtStageSetting(
  draft: Draft, stageCode: string,
  patch: Partial<NonNullable<Draft['edtStageSettings']>[number]>,
): Draft {
  const edt = effectiveQuotationEdt(draft);
  if (!edt) throw new Error('La cotización no tiene EDT.');
  const valid = edt.schemaVersion === 'kora.quotation.reference-edt.v2'
    ? edt.stages?.find((stage) => stage.code === stageCode)
    : edt.modules.find((module) => 'module:' + module.name === stageCode);
  if (!valid) throw new Error('El tramo solicitado no existe.');
  const initial = edt.schemaVersion === 'kora.quotation.reference-edt.v2'
    ? edt.stages?.find((stage) => stage.code === stageCode) : undefined;
  const previous = (draft.edtStageSettings ?? []).find((row) => row.stageCode === stageCode);
  const value = {
    stageCode,
    name: patch.name ?? previous?.name ?? ('name' in valid ? valid.name : stageCode),
    startWeek: patch.startWeek ?? previous?.startWeek ?? initial?.startWeek ?? 1,
    durationWeeks: patch.durationWeeks ?? previous?.durationWeeks ?? initial?.durationWeeks ?? 1,
  };
  if (!value.name.trim() || value.name.length > 300 ||
      !Number.isInteger(value.startWeek) || !Number.isInteger(value.durationWeeks) ||
      value.startWeek < 1 || value.durationWeeks < 1 ||
      value.startWeek + value.durationWeeks - 1 > 520) {
    throw new Error('El nombre o las semanas del tramo son inválidos.');
  }
  const others = (draft.edtStageSettings ?? []).filter(
    (row) => row.stageCode !== stageCode);
  const next = { ...draft, edtStageSettings: [...others, value] };
  quotationEdtAssignments(next);
  return next;
}

