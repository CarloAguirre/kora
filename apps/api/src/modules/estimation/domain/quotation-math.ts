import type { QuotationDraftData } from '@kora/contracts';

const round = (n: number, places: number) => Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;

export function calculateQuotation(draft: QuotationDraftData, hourlyRate: number | null, tax: 'iva19' | 'igv18' | 'exempt') {
  const active = new Set(draft.teams.map((team) => team.teamId));
  const hours = draft.mode === 'team'
    ? draft.teams.reduce((sum, team) =>
        sum + team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration)
          * team.hoursPerWeek, 0)
    : draft.phases.reduce((sum, phase) =>
        sum + phase.teamHours.reduce((acc, item) => acc + (active.has(item.teamId) ? item.hours : 0), 0), 0);
  // totalHours sigue siendo el esfuerzo FUTURO que debe conciliar con la EDT.
  // La Fase 0 solo se incorpora al valor comercial, jamás a los equipos.
  const totalHours = round(hours, 2);
  const historicalHours = round(draft.phaseZeroBillableHours ?? 0, 2);
  const billableHours = round(totalHours + historicalHours, 2);
  if (hourlyRate === null) return { totalHours, billableHours, netAmount: null, totalAmount: null };
  const oneTimeCosts = draft.costs.filter((item) => item.recurrence === 'once').reduce((sum, item) => sum + item.amount, 0);
  const netAmount = round(billableHours * hourlyRate + oneTimeCosts, 4);
  const taxRate = tax === 'iva19' ? 0.19 : tax === 'igv18' ? 0.18 : 0;
  return { totalHours, billableHours, netAmount, totalAmount: round(netAmount * (1 + taxRate), 4) };
}
