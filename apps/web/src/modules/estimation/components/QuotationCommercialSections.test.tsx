import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationDraftDataSchema, quotationVersionSchema } from '@kora/contracts';
import { QuotationCommercialSections } from './QuotationCommercialSections';
import textFieldStyles from '@/shared/components/ui/TextField.module.css';
import selectStyles from '@/shared/components/ui/Select.module.css';
import buttonStyles from '@/shared/components/ui/Button.module.css';

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
    expect(screen.queryByText(/Exclusiones del alcance/)).not.toBeInTheDocument();
    expect(screen.queryByText('Respuestas del cuestionario IA')).not.toBeInTheDocument();
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


  it('usa TextField, Select y Button compartidos sin alterar campos existentes', () => {
    const update = vi.fn();
    render(<QuotationCommercialSections version={version} draft={draft}
      rate={0.62} currency="UF" editable onDraftChange={update} />);
    const requiredClass = (value: string | undefined, label: string): string => {
      if (!value) throw new Error('Falta clase nativa de Kora: ' + label);
      return value;
    };
    expect(screen.getByRole('textbox', { name: 'Descripción costo 1' }).parentElement)
      .toHaveClass(requiredClass(textFieldStyles.field, 'TextField.field'));
    expect(screen.getByRole('combobox', { name: 'Cobro costo 1' }).parentElement)
      .toHaveClass(requiredClass(selectStyles.field, 'Select.field'));
    expect(screen.getByRole('button', { name: '+ Agregar costo' }))
      .toHaveClass(requiredClass(buttonStyles.outline, 'Button.outline'));
    expect(screen.getByRole('button', { name: 'Eliminar costo 1' }))
      .toHaveClass(requiredClass(buttonStyles.ghost, 'Button.ghost'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Descripción costo 1' }),
      { target: { value: 'Licencia anual' } });
    expect(update).toHaveBeenCalledWith({
      costs: [{ ...draft.costs[0], description: 'Licencia anual' }, draft.costs[1]],
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Monto costo 1' }),
      { target: { value: '12.5' } });
    expect(update).toHaveBeenCalledWith({
      costs: [{ ...draft.costs[0], amount: 12.5 }, draft.costs[1]],
    });
  });

  it('mantiene los cambios de tramos, fases, fechas y supuestos sin recalcular el neto', () => {
    const update = vi.fn();
    const withDate = quotationDraftDataSchema.parse({
      ...draft, paymentPlan: [
        ...draft.paymentPlan,
        { name: 'Hito final', percent: 0, trigger: 'date', triggerDate: '2026-12-01' },
      ],
    });
    render(<QuotationCommercialSections version={version} draft={withDate}
      rate={0.62} currency="UF" editable onDraftChange={update} />);
    fireEvent.change(screen.getByLabelText('Fase de pago 2'),
      { target: { value: 'T01 · Integración' } });
    expect(update).toHaveBeenCalledWith({
      paymentPlan: withDate.paymentPlan.map((row, i) => i === 1
        ? { ...row, triggerPhase: 'T01 · Integración' } : row),
    });
    fireEvent.change(screen.getByLabelText('Fecha de pago 3'),
      { target: { value: '2026-12-10' } });
    expect(update).toHaveBeenCalledWith({
      paymentPlan: withDate.paymentPlan.map((row, i) => i === 2
        ? { ...row, triggerDate: '2026-12-10' } : row),
    });
    fireEvent.change(screen.getByLabelText('Supuestos de la cotización'),
      { target: { value: 'Sin soporte\nCon acceso a pruebas' } });
    expect(update).toHaveBeenCalledWith({
      assumptions: ['Sin soporte', 'Con acceso a pruebas'],
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar tramo' }));
    expect(update).toHaveBeenCalledWith({
      paymentPlan: [...withDate.paymentPlan,
        { name: 'Nuevo hito', percent: 0, trigger: 'approval' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar costo 2' }));
    expect(update).toHaveBeenCalledWith({
      costs: [withDate.costs[0]],
    });
    expect(screen.getByText('4,52 UF')).toBeInTheDocument();
    expect(screen.getByText('6,78 UF')).toBeInTheDocument();
  });

  it('preserva solo lectura, incluyendo selectores de cobro y fecha', () => {
    const withDate = quotationDraftDataSchema.parse({
      ...draft, paymentPlan: [...draft.paymentPlan,
        { name: 'Hito final', percent: 0, trigger: 'date', triggerDate: '2026-12-01' }],
    });
    render(<QuotationCommercialSections version={version} draft={withDate}
      rate={0.62} currency="UF" editable={false} onDraftChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Cobro costo 1' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Hito de cobro 1' })).toBeDisabled();
    expect(screen.getByLabelText('Fecha de pago 3')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '+ Agregar tramo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar costo 1' })).not.toBeInTheDocument();
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
