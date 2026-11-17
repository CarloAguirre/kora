import type { QuotationDraftData } from './quotation.contract';

/** Calendario comercial en medias semanas, compatible con las EDT IA antiguas enteras. */
export function isValidQuotationWeekSpan(startWeek: number, durationWeeks: number): boolean {
  return Number.isFinite(startWeek) && Number.isFinite(durationWeeks) &&
    Number.isInteger(startWeek * 2) && Number.isInteger(durationWeeks * 2) &&
    startWeek >= 1 && durationWeeks >= 0.5 &&
    startWeek + durationWeeks <= 521;
}

export type QuotationPhaseOverload = {
  teamId: string;
  week: number;
  hours: number;
  availableHours: number;
};

/**
 * Distribución conservadora: cada media semana aporta media jornada disponible.
 * Reparte HH WBS sin inventar tareas ni dotación, y suma fases simultáneas.
 */
export function quotationPhaseCapacityOverloads(
  draft: Pick<QuotationDraftData, 'phases' | 'teams' | 'edtCapacityCustomizedTeamIds'>,
): QuotationPhaseOverload[] {
  const byTeam = new Map(draft.teams.map((team) => [team.teamId, team]));
  const slots = new Map<string, Map<number, number>>();
  for (const phase of draft.phases) {
    if (!isValidQuotationWeekSpan(phase.startWeek, phase.durationWeeks)) {
      throw new Error('Las semanas de cada fase deben avanzar de 0,5 en 0,5 dentro del calendario.');
    }
    const halfCount = Math.round(phase.durationWeeks * 2);
    const first = Math.round((phase.startWeek - 1) * 2);
    for (const row of phase.teamHours) {
      if (row.hours <= 0 || !byTeam.has(row.teamId)) continue;
      const map = slots.get(row.teamId) ?? new Map<number, number>();
      const cents = Math.round(row.hours * 100);
      const base = Math.floor(cents / halfCount);
      const remainder = cents % halfCount;
      for (let n = 0; n < halfCount; n++) {
        const slot = first + n;
        const amount = base + (n < remainder ? 1 : 0);
        map.set(slot, (map.get(slot) ?? 0) + amount);
      }
      slots.set(row.teamId, map);
    }
  }
  const overloads: QuotationPhaseOverload[] = [];
  for (const [teamId, loads] of slots) {
    const team = byTeam.get(teamId)!;
    const perPerson = draft.edtCapacityCustomizedTeamIds?.includes(teamId)
      ? team.hoursPerWeek : (team.hoursPerWeek > 0 ? team.hoursPerWeek : 40);
    const availableHours = Math.round(perPerson * team.collaborators * 50) / 100;
    for (const [slot, cents] of loads) {
      const hours = cents / 100;
      if (hours > availableHours + 0.005) {
        overloads.push({ teamId, week: 1 + slot / 2, hours, availableHours });
      }
    }
  }
  return overloads.sort((a, b) => a.week - b.week || a.teamId.localeCompare(b.teamId));
}

/** Llamar solo si un usuario modifica inicio/duración, no al abrir cotizaciones legacy. */
export function assertQuotationPhaseCapacity(
  draft: Pick<QuotationDraftData, 'phases' | 'teams' | 'edtCapacityCustomizedTeamIds'>,
  teamName?: (id: string) => string,
): void {
  const [overload] = quotationPhaseCapacityOverloads(draft);
  if (!overload) return;
  const label = teamName?.(overload.teamId) ?? overload.teamId;
  throw new Error('Plazo inviable para ' + label + ' en semana ' +
    overload.week.toLocaleString('es-CL') + ': ' +
    overload.hours.toLocaleString('es-CL') + ' HH asignadas en media semana frente a ' +
    overload.availableHours.toLocaleString('es-CL') +
    ' HH disponibles. Aumenta duración/dotación o redistribuye fases.');
}
