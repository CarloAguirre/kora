import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SupportProjectSummary } from '@kora/contracts';
import { SupportHoursStatus } from './SupportHoursStatus';

function buildSummary(overrides: Partial<SupportProjectSummary> = {}): SupportProjectSummary {
  return {
    planType: 'monthly',
    contractedHours: 20,
    planValueUf: 0,
    extraHourValueUf: 0,
    currency: 'UF',
    usedHours: 69.25,
    availableHours: 27.75,
    currentPeriod: { usedHours: 1, capacityHours: 27.75, remainingHours: 26.75, planHours: 20, priorSurplusHours: 7.75 },
    history: [],
    ...overrides,
  };
}

describe('SupportHoursStatus', () => {
  it('mensual: destaca lo que queda del mes y desglosa plan + acumuladas', () => {
    render(<SupportHoursStatus summary={buildSummary()} />);

    expect(screen.getByText('26,75 h')).toBeInTheDocument();
    expect(screen.getByText('restantes este mes')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Consumo de horas' })).toHaveAttribute('aria-valuetext', '1 de 27,75 h utilizadas');
    expect(screen.getByText('Plan del mes').nextSibling).toHaveTextContent('20 h');
    expect(screen.getByText('Acumuladas de meses anteriores').nextSibling).toHaveTextContent('7,75 h');
    expect(screen.getByText('Utilizadas en todo el contrato').nextSibling).toHaveTextContent('69,25 h');
    expect(screen.queryByText(/Excedido/)).not.toBeInTheDocument();
  });

  it('avisa el exceso cuando lo utilizado supera lo disponible', () => {
    render(
      <SupportHoursStatus
        summary={buildSummary({
          currentPeriod: { usedHours: 30, capacityHours: 20, remainingHours: 0, planHours: 20, priorSurplusHours: 0 },
        })}
      />,
    );

    expect(screen.getByText('restantes este mes').previousSibling).toHaveTextContent('0 h');
    expect(screen.getByText('Excedido en 10 h')).toBeInTheDocument();
  });

  it('a demanda: sin barra, solo lo utilizado', () => {
    render(<SupportHoursStatus summary={buildSummary({ planType: 'on_demand', currentPeriod: null, availableHours: null })} />);

    expect(screen.getByText('69,25 h')).toBeInTheDocument();
    expect(screen.getByText('A demanda: sin tope de horas.')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });
});
