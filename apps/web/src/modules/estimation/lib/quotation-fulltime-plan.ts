import {
  effectiveQuotationEdt, quotationEdtAssignments,
  type QuotationDraftData,
} from '@kora/contracts';

/**
 * Replanificación comercial al cambiar dotación de una EDT IA.
 *
 * Preserva cada HH WBS×perfil. Comprime las ventanas del calendario
 * respetando las coincidencias temporales (fases paralelas), sin transformar
 * capacidades en esfuerzo ficticio. La última semana admite trabajo parcial.
 * La fuente aiPoc.edt permanece inmutable.
 */
export function replanQuotationEdtForWorkforce(draft: QuotationDraftData): QuotationDraftData {
  const edt = effectiveQuotationEdt(draft);
  if (!edt || edt.schemaVersion !== 'kora.quotation.reference-edt.v2') return draft;
  const sourceStages = edt.stages ?? [];
  const regular = sourceStages.filter((stage) => stage.code !== 'TL-GOV');
  if (!regular.length) return draft;
  const allocations = quotationEdtAssignments(draft);
  const relevant = allocations.filter((row) =>
    regular.some((stage) => stage.code === row.stageCode));
  // No inventar equivalencias si una asignación sigue sin equipo real.
  if (relevant.some((row) => !row.teamId)) return draft;
  const people = new Map(draft.teams.map((team) =>
    [team.teamId, Math.max(1, team.collaborators)]));
  const current = regular.map((stage) => {
    const override = draft.edtStageSettings?.find((setting) =>
      setting.stageCode === stage.code);
    return {
      code: stage.code, name: override?.name ?? stage.name,
      startWeek: override?.startWeek ?? stage.startWeek,
      durationWeeks: override?.durationWeeks ?? stage.durationWeeks,
    };
  });
  const boundaries = [...new Set(current.flatMap((stage) =>
    [stage.startWeek, stage.startWeek + stage.durationWeeks]))]
    .sort((a, b) => a - b);
  const moved = new Map<number, number>();
  let nextWeek = 1;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i]!, to = boundaries[i + 1]!;
    moved.set(from, nextWeek);
    const segmentLoads = new Map<string, number>();
    for (const stage of current) {
      if (stage.startWeek > from ||
          stage.startWeek + stage.durationWeeks < to) continue;
      for (const row of relevant) {
        if (row.stageCode !== stage.code || !row.teamId) continue;
        const hh = row.hours * (to - from) / stage.durationWeeks;
        segmentLoads.set(row.teamId, (segmentLoads.get(row.teamId) ?? 0) + hh);
      }
    }
    if (segmentLoads.size) {
      nextWeek += Math.max(1, ...[...segmentLoads].map(([id, amount]) =>
        Math.ceil(amount / (40 * (people.get(id) ?? 1)))));
    }
    if (nextWeek > 521) throw new Error('La dotación indicada requiere más de 520 semanas.');
  }
  moved.set(boundaries[boundaries.length - 1]!, nextWeek);
  const planned = current.map((stage) => ({
    stageCode: stage.code, name: stage.name,
    startWeek: moved.get(stage.startWeek)!,
    durationWeeks: Math.max(1, moved.get(stage.startWeek + stage.durationWeeks)! -
      moved.get(stage.startWeek)!),
  }));
  const commercialHorizon = Math.max(1, ...(draft.edtCommercialStages ?? []).map((stage) =>
    stage.startWeek + stage.durationWeeks - 1));
  const horizon = Math.max(commercialHorizon,
    ...planned.map((stage) => stage.startWeek + stage.durationWeeks - 1));

  // La supervisión obligatoria son 5 HH por semana del nuevo horizonte,
  // no 40 HH por semana ni las mismas 5*semanas del calendario antiguo.
  const leadStage = sourceStages.find((stage) => stage.code === 'TL-GOV');
  const leadTask = edt.modules.flatMap((module) => module.tasks).find((task) =>
    task.wbs === 'TL-GOV.01');
  const leadRole = leadTask?.roleEffort?.[0]?.role ?? leadTask?.role;
  if (leadStage && leadTask && leadRole) {
    planned.push({
      stageCode: 'TL-GOV', name: draft.edtStageSettings?.find((stage) =>
        stage.stageCode === 'TL-GOV')?.name ?? leadStage.name,
      startWeek: 1, durationWeeks: horizon,
    });
  }
  const affected = new Set(planned.map((stage) => stage.stageCode));
  const adjustedHours = (draft.edtHourAdjustments ?? []).filter((row) =>
    !(leadTask && row.wbs === leadTask.wbs && row.role === leadRole));
  const sourceLeadHours = draft.aiPoc?.edt?.modules.flatMap((module) =>
    module.tasks).find((task) => task.wbs === 'TL-GOV.01')
    ?.roleEffort?.find((effort) => effort.role === leadRole)?.hours;
  if (leadTask && leadRole && sourceLeadHours !== undefined &&
      sourceLeadHours !== 5 * horizon) {
    adjustedHours.push({ wbs: leadTask.wbs, role: leadRole, hours: 5 * horizon });
  }
  return {
    ...draft,
    edtStageSettings: [
      ...(draft.edtStageSettings ?? []).filter((stage) => !affected.has(stage.stageCode)),
      ...planned,
    ],
    edtHourAdjustments: adjustedHours,
    teams: draft.teams.map((team) => ({
      ...team, unit: 'week' as const, duration: 0,
      hoursPerWeek: 40, dedicationPercent: 100,
    })),
  };
}
