import type { QuotationDraftData } from '@kora/contracts';

const round = (n: number, places: number) => Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;

export function calculateQuotation(draft: QuotationDraftData, hourlyRate: number | null, tax: 'iva19' | 'igv18' | 'exempt') {
  const active = new Set(draft.teams.map((team) => team.teamId));
  const hours = draft.mode === 'team'
    ? draft.teams.reduce((sum, team) =>
        sum + team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration)
          * team.hoursPerWeek * team.dedicationPercent / 100, 0)
    : draft.phases.reduce((sum, phase) =>
        sum + phase.teamHours.reduce((acc, item) => acc + (active.has(item.teamId) ? item.hours : 0), 0), 0);
  const totalHours = round(hours, 2);
  if (hourlyRate === null) return { totalHours, netAmount: null, totalAmount: null };
  const oneTimeCosts = draft.costs.filter((item) => item.recurrence === 'once').reduce((sum, item) => sum + item.amount, 0);
  const netAmount = round(totalHours * hourlyRate + oneTimeCosts, 4);
  const taxRate = tax === 'iva19' ? 0.19 : tax === 'igv18' ? 0.18 : 0;
  return { totalHours, netAmount, totalAmount: round(netAmount * (1 + taxRate), 4) };
}
