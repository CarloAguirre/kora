import {
  effectiveQuotationEdt, quotationEdtAssignments,
  type QuotationDraftData,
} from '@kora/contracts';
import { quotationTeamWeeklyPlan } from '../components/quotation-team-weekly-plan';

/**
 * Replanificación comercial al cambiar dotación de una EDT IA.
 *
 * Preserva cada HH WBS×perfil. Comprime las ventanas del calendario
 * respetando las coincidencias temporales (fases paralelas), sin transformar
 * capacidades en esfuerzo ficticio. La última semana admite trabajo parcial.
 * La fuente aiPoc.edt permanece inmutable.
 */
/**
 * La duración editable en la vista de equipos es un objetivo máximo, no un
 * valor independiente que pueda falsear el calendario y la dedicación.
 */
export type QuotationTeamDeadline = { teamId: string; maxWeeks: number };

/** Unificar semanas de equipo y ventanas EDT; jamás calcular dedicación
 * usando una duración introducida manualmente pero sin tareas calendarizadas.
 */
export function alignQuotationEdtTeamsWithSchedule(draft: QuotationDraftData): QuotationDraftData {
  if (!draft.aiPoc?.edt || draft.aiPoc.edt.schemaVersion !==
      'kora.quotation.reference-edt.v2') return draft;
  const weeks = quotationTeamWeeklyPlan(draft);
  if (!weeks) return draft;
  const spans = new Map(weeks.rows.map((row) =>
    [row.teamKey, row.lastWeek - row.firstWeek + 1]));
  return {
    ...draft,
    teams: draft.teams.map((team) => ({
      ...team,
      unit: 'week' as const,
      duration: spans.get(team.teamId) ?? 0,
    })),
  };
}

export function replanQuotationEdtForWorkforce(
  draft: QuotationDraftData, deadline?: QuotationTeamDeadline,
): QuotationDraftData {
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
  // Replanificar siempre desde un calendario ESTABLE: el original de la IA
  // o la referencia modificada manualmente por el usuario. Las fechas en
  // edtStageSettings son la SALIDA de la última replanificación y no pueden
  // volver a ser su entrada (3 -> 4 -> 3 debe dar el mismo plan que 3).
  const current = regular.map((stage) => {
    const override = draft.edtStageSettings?.find((setting) =>
      setting.stageCode === stage.code);
    const reference = draft.edtWorkforceReferenceStages?.find((setting) =>
      setting.stageCode === stage.code);
    return {
      code: stage.code, name: override?.name ?? stage.name,
      startWeek: reference?.startWeek ?? stage.startWeek,
      durationWeeks: reference?.durationWeeks ?? stage.durationWeeks,
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
      nextWeek += Math.max(1, ...[...segmentLoads].map(([id, amount]) => {
        const capacity = draft.teams.find((team) => team.teamId === id)?.hoursPerWeek ?? 40;
        if (capacity <= 0) throw new Error('Define HH/semana positivas para el equipo ' + id);
        return Math.ceil(amount / (capacity * (people.get(id) ?? 1)));
      }));
    }
    if (nextWeek > 521) throw new Error('La dotación indicada requiere más de 520 semanas.');
  }
  moved.set(boundaries[boundaries.length - 1]!, nextWeek);
  let planned = current.map((stage) => ({
    stageCode: stage.code, name: stage.name,
    startWeek: moved.get(stage.startWeek)!,
    durationWeeks: Math.max(1, moved.get(stage.startWeek + stage.durationWeeks)! -
      moved.get(stage.startWeek)!),
  }));

  // Antes se redondeaba CADA intervalo a una semana. Esto introducía semanas
  // fantasma (p.ej. dos tramos consecutivos de 20 HH => 2 semanas al 50%).
  // Empaquetar intervalos en fracciones y validar sobre el reparto semanal
  // REAL de la EDT antes de modificar el calendario persistido.
  const fractional = new Map<number, number>();
  let elapsed = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i]!, to = boundaries[i + 1]!;
    fractional.set(from, elapsed);
    const segmentLoads = new Map<string, number>();
    for (const stage of current) {
      if (stage.startWeek > from || stage.startWeek + stage.durationWeeks < to) continue;
      for (const row of relevant) {
        if (row.stageCode !== stage.code || !row.teamId) continue;
        segmentLoads.set(row.teamId, (segmentLoads.get(row.teamId) ?? 0) +
          row.hours * (to - from) / stage.durationWeeks);
      }
    }
    elapsed += Math.max(0, ...[...segmentLoads].map(([id, amount]) => {
      const team = draft.teams.find((item) => item.teamId === id);
      const capacity = draft.edtCapacityCustomizedTeamIds?.includes(id)
        ? (team?.hoursPerWeek ?? 40) : 40;
      return amount / (capacity * (people.get(id) ?? 1));
    }));
  }
  fractional.set(boundaries[boundaries.length - 1]!, elapsed);
  const baselineHorizon = Math.max(1, ...planned.map((stage) =>
    stage.startWeek + stage.durationWeeks - 1));
  const relevantTeamIds = new Set(relevant.flatMap((row) => row.teamId ? [row.teamId] : []));
  let bestHorizon = baselineHorizon;

  // Un poco de holgura reduce picos producidos al representar sub-semanas
  // con fechas semanales enteras. Elegimos el horizonte válido más corto.
  for (let iteration = 0; iteration <= 100; iteration++) {
    const factor = 1 + iteration / 40;
    const candidate = current.map((stage) => {
      const from = fractional.get(stage.startWeek)! * factor;
      const to = fractional.get(stage.startWeek + stage.durationWeeks)! * factor;
      const startWeek = Math.floor(from + 1e-8) + 1;
      const lastWeek = Math.max(startWeek, Math.ceil(to - 1e-8));
      return {
        stageCode: stage.code, name: stage.name,
        startWeek, durationWeeks: lastWeek - startWeek + 1,
      };
    });
    const horizon = Math.max(...candidate.map((stage) =>
      stage.startWeek + stage.durationWeeks - 1));
    if (horizon >= bestHorizon || horizon > 520) continue;
    const provisional: QuotationDraftData = {
      ...draft,
      edtStageSettings: [
        ...(draft.edtStageSettings ?? []).filter((item) =>
          !candidate.some((stage) => stage.stageCode === item.stageCode)),
        ...candidate,
      ],
    };
    const weekly = quotationTeamWeeklyPlan(provisional);
    if (!weekly) continue;
    const capacityValid = weekly.rows.every((row) => {
      if (!relevantTeamIds.has(row.teamKey)) return true;
      const team = draft.teams.find((item) => item.teamId === row.teamKey);
      const perPerson = draft.edtCapacityCustomizedTeamIds?.includes(row.teamKey)
        ? (team?.hoursPerWeek ?? 40) : 40;
      return [...row.weeklyHours.values()].every((hours) =>
        hours <= perPerson * (people.get(row.teamKey) ?? 1) + 0.005);
    });
    if (capacityValid) {
      planned = candidate;
      bestHorizon = horizon;
    }
  }

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
  const updated: QuotationDraftData = {
    ...draft,
    edtStageSettings: [
      ...(draft.edtStageSettings ?? []).filter((stage) => !affected.has(stage.stageCode)),
      ...planned,
    ],
    edtHourAdjustments: adjustedHours,
    teams: draft.teams.map((team) => ({
      ...team, unit: 'week' as const, duration: 0,
      hoursPerWeek: draft.edtCapacityCustomizedTeamIds?.includes(team.teamId)
        ? team.hoursPerWeek : 40,
      dedicationPercent: draft.edtCapacityCustomizedTeamIds?.includes(team.teamId)
        ? team.dedicationPercent : 100,
    })),
  };
  const synchronized = alignQuotationEdtTeamsWithSchedule(updated);
  if (deadline) {
    if (!Number.isInteger(deadline.maxWeeks) ||
        deadline.maxWeeks < 1 || deadline.maxWeeks > 520) {
      throw new Error('La duración objetivo debe estar entre 1 y 520 semanas.');
    }
    const actual = synchronized.teams.find((team) =>
      team.teamId === deadline.teamId)?.duration;
    if (actual === undefined || actual <= 0)
      throw new Error('El equipo no tiene actividades EDT calendarizadas.');
    if (actual > deadline.maxWeeks) {
      throw new Error('El equipo requiere al menos ' + actual +
        ' semanas según la EDT y la capacidad asignada. No se modificó el ' +
        'roadmap. Aumenta colaboradores o ajusta las dependencias de las fases.');
    }
  }
  return synchronized;
}
