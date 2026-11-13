import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectProgressOverview } from './ProjectProgressOverview';

describe('ProjectProgressOverview — plazo calendario sin plan', () => {
  it('distingue plazo transcurrido de avance real', () => {
    render(<ProjectProgressOverview bare actualPercent={null} expectedPercent={null}
      scheduleElapsedPercent={85} startDate="30-03-2026" endDate="21-12-2026" />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('del plazo transcurrido')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Plazo calendario transcurrido 85%/i })).toBeInTheDocument();
  });
  it('un plan operativo mantiene sin cambios avance real y esperado', () => {
    render(<ProjectProgressOverview bare actualPercent={30} expectedPercent={60} scheduleElapsedPercent={85} />);
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('del proyecto completado')).toBeInTheDocument();
    expect(screen.queryByText('del plazo transcurrido')).not.toBeInTheDocument();
  });
  it('sin fechas y sin plan sigue sin inventar avance', () => {
    render(<ProjectProgressOverview bare actualPercent={null} expectedPercent={null} />);
    expect(screen.getByText(/El avance se mostrará apenas el plan de trabajo/)).toBeInTheDocument();
  });
});
