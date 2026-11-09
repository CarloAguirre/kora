import {
  quotationEdtAssignments, redistributeQuotationEdtHours,
  type QuotationDraftData,
} from '@kora/contracts';

export type QuotationHourChange = {
  wbs: string;
  role: string;
  name: string;
  fixed: boolean;
  before: number;
  after: number;
  delta: number;
};
export type QuotationRedistributionPreview = {
  sourceDraft: QuotationDraftData;
  nextDraft: QuotationDraftData;
  teamKey: string;
  stageCode?: string;
  module?: string;
  before: number;
  after: number;
  delta: number;
  changes: QuotationHourChange[];
};

const cents = (value: number) => Math.round(value * 100);
const fmt = (value: number) => Math.round(value * 100) / 100;
const key = (wbs: string, role: string) => JSON.stringify([wbs, role]);

/** La misma operación determinística de contratos se simula ANTES de aplicar.
 * Cancelar no toca el borrador, y la vista previa no inventa una distribución
 * distinta de la que terminará guardándose.
 */
export function buildQuotationRedistributionPreview(
  draft: QuotationDraftData,
  params: { teamKey: string; targetHours: number; stageCode?: string; module?: string },
): QuotationRedistributionPreview {
  const matches = (row: ReturnType<typeof quotationEdtAssignments>[number]) =>
    row.teamKey === params.teamKey &&
    (params.stageCode === undefined || row.stageCode === params.stageCode) &&
    (params.module === undefined || row.module === params.module);
  const previous = quotationEdtAssignments(draft).filter(matches);
  const nextDraft = redistributeQuotationEdtHours(draft, params);
  const next = new Map(quotationEdtAssignments(nextDraft).filter(matches)
    .map((row) => [key(row.wbs, row.role), row]));
  const changes = previous.map((row) => {
    const updated = next.get(key(row.wbs, row.role));
    if (!updated) throw new Error('Una tarea desapareció durante la redistribución.');
    return {
      wbs: row.wbs, role: row.role, name: row.name, fixed: row.fixed,
      before: row.hours, after: updated.hours,
      delta: fmt(updated.hours - row.hours),
    };
  });
  const before = fmt(previous.reduce((sum, row) => sum + row.hours, 0));
  const after = fmt(changes.reduce((sum, row) => sum + row.after, 0));
  if (cents(after) !== cents(params.targetHours) || !changes.length) {
    throw new Error('La redistribución no concilia exactamente con las HH solicitadas.');
  }
  return {
    sourceDraft: draft, nextDraft, teamKey: params.teamKey,
    ...(params.stageCode ? { stageCode: params.stageCode } : {}),
    ...(params.module ? { module: params.module } : {}),
    before, after, delta: fmt(after - before), changes,
  };
}
