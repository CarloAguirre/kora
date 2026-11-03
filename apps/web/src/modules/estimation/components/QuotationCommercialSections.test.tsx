import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationDraftDataSchema, quotationVersionSchema } from '@kora/contracts';
import { QuotationCommercialSections } from './QuotationCommercialSections';

vi.mock('../api/estimation.queries', () => ({
  useEstimationQuestionnaireDefinition: () => ({ data: { fixedQuestions: [] } }),
}));

const teamId = '0777e456-fd76-445e-83f1-afc25061c103';
const draft = quotationDraftDataSchema.parse({
  mode: 'phases',
  teams: [{ teamId, collaborators: 1, unit: 'week', duration: 2,
    hoursPerWeek: 40, dedicationPercent: 100 }],
  phases: [{ name: 'T01 · Integración', startWeek: 1, durationWeeks: 2,
    teamHours: [{ teamId, hours: 15 }] }],
  costs: [
    { description: 'Licencia', amount: 2, recurrence: 'once' },
    { description: 'API recurrente', amount: 6, recurrence: 'monthly' },
  ],
  paymentPlan: [
    { name: 'Inicio', percent: 40, trigger: 'approval' },
    { name: 'Entrega', percent: 60, trigger: 'phase', triggerPhase: 'T01 · Integración' },
  ],
  assumptions: ['Ambiente de pruebas disponible.'],
  exclusions: ['No incluye soporte posterior.'],
});
const version = quotationVersionSchema.parse({
  id: '0777e456-fd76-445e-83f1-afc25061c105',
  quotationId: '0777e456-fd76-445e-83f1-afc25061c102',
  versionNumber: 1, revision: 1, status: 'draft', origin: 'manual',
  name: 'Cotización', aiReviewStatus: null,
  createdByUserId: '0777e456-fd76-445e-83f1-afc25061c104',
  hourlyRate: 0.62, currency: 'UF', tax: 'iva19', draft,
  totalHours: 15, netAmount: 11.3, totalAmount: 13.447,
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
});
describe('Cotización v5 · costos, pagos y supuestos', () => {
  it('muestra importes comerciales reales, sin agregar recurrentes al neto', () => {
    render(<QuotationCommercialSections version={version} draft={draft}
      rate={0.62} currency="UF" editable onDraftChange={vi.fn()} />);
    expect(screen.getByText('Licencias y costos externos')).toBeInTheDocument();
    expect(screen.getByText('Plan de pago')).toBeInTheDocument();
    expect(screen.getByText('4,52 UF')).toBeInTheDocument();
    expect(screen.getByText('6,78 UF')).toBeInTheDocument();
    expect(screen.getByText('Plan de pago: 100% de 100%.')).toBeInTheDocument();
    expect(screen.getByText('Supuestos y exclusiones')).toBeInTheDocument();
  });

  it('preserva los triggers de fase, porcentaje y periodicidad existentes', () => {
    const update = vi.fn();
    render(<QuotationCommercialSections version={version} draft={draft}
      rate={0.62} currency="UF" editable onDraftChange={update} />);
    fireEvent.change(screen.getByLabelText('Porcentaje de pago 1'),
      { target: { value: '45' } });
    expect(update).toHaveBeenCalledWith({
      paymentPlan: [{ ...draft.paymentPlan[0], percent: 45 }, draft.paymentPlan[1]],
    });
    fireEvent.change(screen.getByLabelText('Cobro costo 1'),
      { target: { value: 'annual' } });
    expect(update).toHaveBeenCalledWith({
      costs: [{ ...draft.costs[0], recurrence: 'annual' }, draft.costs[1]],
    });
  });

  it('no permite editar campos comerciales cuando la versión está cerrada', () => {
    render(<QuotationCommercialSections version={version} draft={draft}
      rate={0.62} currency="UF" editable={false} onDraftChange={vi.fn()} />);
    expect(screen.getByLabelText('Porcentaje de pago 1')).toBeDisabled();
    expect(screen.getByLabelText('Monto costo 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '+ Agregar costo' })).not.toBeInTheDocument();
  });

  it('no inventa importes cuando falta tarifa HH', () => {
    render(<QuotationCommercialSections version={version} draft={draft}
      rate={null} currency="UF" editable onDraftChange={vi.fn()} />);
    expect(screen.queryByText('4,52 UF')).not.toBeInTheDocument();
    expect(screen.queryByText('6,78 UF')).not.toBeInTheDocument();
  });
});
