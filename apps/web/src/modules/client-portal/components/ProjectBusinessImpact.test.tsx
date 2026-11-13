import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectBusinessImpact } from './ProjectBusinessImpact';
import { toClientBusinessImpact, type BusinessImpactFields } from '../adapters/business-impact.adapter';

const emptyImpact: BusinessImpactFields = {
  impactBeforeHours: null, impactBeforePeople: null,
  impactBeforeDuration: null, impactBeforeModality: null,
  impactAfterHours: null, impactAfterPeople: null,
  impactAfterDuration: null, impactAfterModality: null,
};

describe('Impacto en el negocio — Vista Cliente de PMO y portal externo', () => {
  it('muestra la misma tarjeta de PMO incluso cuando el proyecto no tiene métricas', () => {
    const { container } = render(<ProjectBusinessImpact impact={toClientBusinessImpact(emptyImpact)}/>);
    expect(screen.getByRole('heading', { name: 'Impacto en el negocio' })).toBeInTheDocument();
    expect(screen.getByText('Antes de automatizar')).toBeInTheDocument();
    expect(screen.getByText('Después — medido en QA / Marcha blanca')).toBeInTheDocument();
    expect(screen.getAllByText('0 horas')).toHaveLength(2);
    expect(screen.getByText('-0%')).toBeInTheDocument();
    expect(container.querySelector('[class*="impactCard"]')).not.toBeNull();
    expect(screen.queryByText('Diseñado y desarrollado por')).not.toBeInTheDocument();
  });

  it('calcula la reducción y conserva los valores reales compartidos por ambas vistas', () => {
    const impact = toClientBusinessImpact({
      impactBeforeHours: 24, impactBeforePeople: '3 personas',
      impactBeforeDuration: '3 días laborales', impactBeforeModality: 'Planillas Excel',
      impactAfterHours: 2, impactAfterPeople: '1 persona',
      impactAfterDuration: 'Mismo día', impactAfterModality: 'Tablero automático',
    });
    render(<ProjectBusinessImpact impact={impact}/>);
    expect(screen.getByText('24 horas')).toBeInTheDocument();
    expect(screen.getByText('2 horas')).toBeInTheDocument();
    expect(screen.getByText('3 personas')).toBeInTheDocument();
    expect(screen.getByText('1 personas')).toBeInTheDocument();
    expect(screen.getByText('Planillas Excel')).toBeInTheDocument();
    expect(screen.getByText('Tablero automático')).toBeInTheDocument();
    expect(screen.getByText('-92%')).toBeInTheDocument();
  });
});
