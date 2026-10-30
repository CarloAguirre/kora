import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationVersionSchema, type QuotationVersion } from '@kora/contracts';
import { compareQuotationTeams, QuotationVersionComparison } from './QuotationVersionComparison';

const TEAM = '0777e456-fd76-445e-83f1-afc25061c101';
const QUOTE = '0777e456-fd76-445e-83f1-afc25061c102';
const USER = '0777e456-fd76-445e-83f1-afc25061c103';
function version(id: string, number: number, hours: number, mode: 'team' | 'phases'): QuotationVersion {
  return quotationVersionSchema.parse({
    id, quotationId: QUOTE, versionNumber: number,
    name: 'Versión ' + number, status: 'draft', origin: 'manual',
    aiReviewStatus: null, revision: 1, createdByUserId: USER,
    hourlyRate: 1, currency: 'UF', tax: 'iva19',
    totalHours: hours, netAmount: hours, totalAmount: hours * 1.19,
    createdAt: '2026-10-30T12:00:00.000Z',
    updatedAt: '2026-10-30T12:00:00.000Z',
    draft: {
      mode,
      teams: [{ teamId: TEAM, collaborators: 2, unit: 'week',
        duration: 2, hoursPerWeek: 40, dedicationPercent: 50 }],
      phases: mode === 'phases'
        ? [{ name: 'Ejecución', startWeek: 1, durationWeeks: 2,
          teamHours: [{ teamId: TEAM, hours }] }]
        : [],
      costs: [], paymentPlan: [], assumptions: [], exclusions: [],
      sourceRefs: [], answers: {},
    },
  });
}
const v1 = version('0777e456-fd76-445e-83f1-afc25061c104', 1, 80, 'team');
const v2 = version('0777e456-fd76-445e-83f1-afc25061c105', 2, 110, 'phases');

describe('QuotationVersionComparison', () => {
  it('compara HH por equipo sin sumar modo equipo y fases simultáneamente', () => {
    expect(compareQuotationTeams(v1, v2)).toEqual([{
      teamId: TEAM, fromHours: 80, toHours: 110, delta: 30,
    }]);
  });

  it('muestra el comparador al solicitarlo y no muta las versiones', () => {
    render(<QuotationVersionComparison versions={[v1, v2]} teamNames={new Map([[TEAM, 'Desarrollo']])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByText('Desarrollo')).toBeInTheDocument();
    expect(screen.getByText('+30')).toBeInTheDocument();
    expect(screen.getByText(/Diferencia de neto/)).toBeInTheDocument();
    expect(v1.draft.mode).toBe('team');
    expect(v2.draft.mode).toBe('phases');
  });

  it('no muestra comparación para una sola versión', () => {
    const { container } = render(<QuotationVersionComparison versions={[v1]} teamNames={new Map()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('evita mostrar importes entre monedas diferentes', () => {
    const usd = { ...v2, currency: 'USD' as const };
    render(<QuotationVersionComparison versions={[v1, usd]} teamNames={new Map()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByText(/Los importes no son comparables/)).toBeInTheDocument();
  });
});
