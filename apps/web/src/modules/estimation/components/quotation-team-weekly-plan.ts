import { effectiveQuotationEdt, quotationEdtAssignments, type QuotationDraftData } from '@kora/contracts';

export type QuotationTeamWeeklyRow = {
  teamKey: string;
  totalHours: number;
  firstWeek: number;
  lastWeek: number;
  activeWeeks: number;
  averageHoursPerWeek: number;
  weeklyHours: ReadonlyMap<number, number>;
};
export type QuotationTeamWeeklyPlan = {
  lastWeek: number;
  totalHours: number;
  rows: readonly QuotationTeamWeeklyRow[];
  weekTotals: ReadonlyMap<number, number>;
};
const cents = (hours: number) => Math.round(hours * 100);
const hours = (value: number) => value / 100;

/**
 * Carga SEMANAL ORIENTATIVA, no asignación real de actividades a fechas.
 *
 * Fuente de HH: asignaciones WBS×perfil ya conciliadas con el borrador.
 * Fuente de calendario: tramos EDT v2 y sus modificaciones comerciales.
 * Prorratea uniformemente las HH de cada equipo DENTRO DE CADA TRAMO,
 * conserva los centésimos y suma las cargas de tramos solapados.
 *
 * No usa colaboradores, hh/semana ni dedicación como multiplicadores:
 * esas cifras no son la fuente de HH de una propuesta Gemini.
 * También admite cotizaciones manuales en modo fases, que ya tienen semanas.
 * Una EDT v1 sin calendario explícito no produce una planificación inventada.
 */
export function quotationTeamWeeklyPlan(
  draft: QuotationDraftData,
): QuotationTeamWeeklyPlan | null {
  const edt = effectiveQuotationEdt(draft);
  if (!edt && (draft.mode !== 'phases' || !draft.phases.length)) return null;
  const overrides = new Map((draft.edtStageSettings ?? []).map((setting) =>
    [setting.stageCode, setting]));
  const isV2 = edt?.schemaVersion === 'kora.quotation.reference-edt.v2';
  // Incluir las fases comerciales añadidas por el usuario: sin ellas
  // los picos y totales de capacidad omitirían tareas KT- (falsa holgura).
  const commercialStages = (draft.edtCommercialStages ?? []).map((stage) => ({
    code: stage.code, startWeek: stage.startWeek,
    durationWeeks: stage.durationWeeks,
  }));
  const stages = edt
    ? [
        ...(isV2 ? (edt.stages ?? []).map((stage) => ({
          code: stage.code,
          startWeek: overrides.get(stage.code)?.startWeek ?? stage.startWeek,
          durationWeeks: overrides.get(stage.code)?.durationWeeks ?? stage.durationWeeks,
        })) : edt.modules.map((module) => {
          const code = 'module:' + module.name;
          const explicit = overrides.get(code);
          return explicit ? {
            code, startWeek: explicit.startWeek, durationWeeks: explicit.durationWeeks,
          } : null;
        })),
        ...commercialStages,
      ]
    : draft.phases.map((phase, index) => ({
        code: 'phase:' + index,
        startWeek: phase.startWeek,
        durationWeeks: phase.durationWeeks,
      }));
  // La EDT v1 no registra semanas: solo se muestran cuando TODOS sus
  // módulos tienen una planificación comercial explícita.
  if (!stages.length || stages.some((stage) => !stage)) return null;
  const scheduled = stages.filter((stage): stage is NonNullable<typeof stage> =>
    stage !== null);
  const stageByCode = new Map(scheduled.map((stage) => [stage.code, stage]));
  const lastWeek = Math.max(...scheduled.map((stage) =>
    stage.startWeek + stage.durationWeeks - 1));

  const assignments = edt
    ? quotationEdtAssignments(draft).map((row) => ({
        teamKey: row.teamKey,
        // Las tareas comerciales usan su fase KS- en EDT v1 y v2;
        // las originales v1 se calendarizan por módulo explícito.
        stageCode: row.wbs.startsWith('KT-') ? row.stageCode
          : isV2 ? row.stageCode : 'module:' + row.module,
        hours: row.hours,
      }))
    : draft.phases.flatMap((phase, index) =>
        phase.teamHours.map((row) => ({
          teamKey: row.teamId, stageCode: 'phase:' + index, hours: row.hours,
        })));
  const byTeamStage = new Map<string, Map<string, number>>();
  for (const row of assignments) {
    const stageCode = row.stageCode;
    if (!stageCode || !stageByCode.has(stageCode)) return null;
    let stagesForTeam = byTeamStage.get(row.teamKey);
    if (!stagesForTeam) {
      stagesForTeam = new Map();
      byTeamStage.set(row.teamKey, stagesForTeam);
    }
    stagesForTeam.set(stageCode,
      (stagesForTeam.get(stageCode) ?? 0) + cents(row.hours));
  }

  const weekTotalsCents = new Map<number, number>();
  const rows: QuotationTeamWeeklyRow[] = [];
  let totalCents = 0;
  for (const [teamKey, stageHours] of byTeamStage) {
    const teamWeekCents = new Map<number, number>();
    const activeWeeks = new Set<number>();
    let teamTotalCents = 0;
    for (const [stageCode, amount] of stageHours) {
      const stage = stageByCode.get(stageCode)!;
      teamTotalCents += amount;
      const base = Math.floor(amount / stage.durationWeeks);
      const remainder = amount % stage.durationWeeks;
      for (let offset = 0; offset < stage.durationWeeks; offset++) {
        const week = stage.startWeek + offset;
        const allocated = base + (offset < remainder ? 1 : 0);
        teamWeekCents.set(week, (teamWeekCents.get(week) ?? 0) + allocated);
        weekTotalsCents.set(week, (weekTotalsCents.get(week) ?? 0) + allocated);
        activeWeeks.add(week);
      }
    }
    totalCents += teamTotalCents;
    const weeks = [...activeWeeks].sort((a, b) => a - b);
    rows.push({
      teamKey,
      totalHours: hours(teamTotalCents),
      firstWeek: weeks[0] ?? 1,
      lastWeek: weeks[weeks.length - 1] ?? 1,
      activeWeeks: weeks.length,
      averageHoursPerWeek: weeks.length ? hours(teamTotalCents) / weeks.length : 0,
      weeklyHours: new Map([...teamWeekCents].map(([week, amount]) =>
        [week, hours(amount)])),
    });
  }
  return {
    lastWeek, totalHours: hours(totalCents), rows,
    weekTotals: new Map([...weekTotalsCents].map(([week, amount]) =>
      [week, hours(amount)])),
  };
}
