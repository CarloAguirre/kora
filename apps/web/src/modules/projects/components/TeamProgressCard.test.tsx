import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TeamProgress } from '../lib/team-progress';
import { TeamProgressCard } from './TeamProgressCard';

const progress: TeamProgress = {
  hasPlan: true,
  plannedHours: 180, actualHours: 16, expectedHours: 89,
  actualPercent: 9, expectedPercent: 49,
  consumedHours: 77, consumptionPercent: 43, assignedHours: 180,
  unplannedBlockCount: 0, unlinkedTaskCount: 0, paused: false,
  phases: [
    {
      id: 'phase-1', number: 1, name: 'Mejoras y correcciones',
      estimatedHours: 100, actualHours: 16, expectedHours: 46,
      actualPercent: 16, expectedPercent: 46, gapPoints: 17,
      pendingApprovalCount: 2, overdueCount: 1, unassignedCount: 0,
      blocks: [{
        id: 'block-1', name: 'Mejoras y correcciones Desarrollo',
        estimatedHours: 100, actualHours: 16, expectedHours: 46,
        actualPercent: 16, expectedPercent: 46, coveragePercent: 80,
        isClosed: false, pendingApprovalCount: 2, overdueCount: 1, unassignedCount: 0,
      }],
    },
    {
      id: 'phase-2', number: 2, name: 'Calculadora de estimaciones',
      estimatedHours: 80, actualHours: 0, expectedHours: 43,
      actualPercent: 0, expectedPercent: 54, gapPoints: 24,
      pendingApprovalCount: 1, overdueCount: 0, unassignedCount: 0,
      blocks: [{
        id: 'block-2', name: 'Calculadora Desarrollo',
        estimatedHours: 80, actualHours: 0, expectedHours: 43,
        actualPercent: 0, expectedPercent: 54, coveragePercent: 100,
        isClosed: false, pendingApprovalCount: 1, overdueCount: 0, unassignedCount: 0,
      }],
    },
  ],
};

describe('Avance del equipo — fidelización del desplegable V5', () => {
  it('muestra 9% real, 49% según plan y el consumo distinto del avance', () => {
    render(<TeamProgressCard progress={progress} teamName="Desarrollo" />);
    expect(screen.getByRole('heading', { name: 'Avance del equipo' })).toBeInTheDocument();
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
    expect(screen.getByText('9%')).toBeInTheDocument();
    expect(screen.getByText(/HH consumidas: 43% de las asignadas al equipo/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Avance real 9%; plan a la fecha 49%/ })).toBeInTheDocument();
    expect(screen.getByText('Plan a la fecha: 49%')).toBeInTheDocument();
  });

  it('despliega explicación, brechas por fase, bloques y HH sin inventar', () => {
    render(<TeamProgressCard progress={progress} teamName="Desarrollo" />);
    const toggle = screen.getByRole('button', { name: '¿Cómo se calcula este avance?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Qué explica la diferencia')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Qué explica la diferencia')).toBeInTheDocument();
    expect(screen.getByText('1. El plan')).toBeInTheDocument();
    expect(screen.getByText('2. Las tareas')).toBeInTheDocument();
    expect(screen.getByText('3. La entrega')).toBeInTheDocument();
    expect(screen.getByText('−24 pts')).toBeInTheDocument();
    expect(screen.getByText('−17 pts')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Fase 1: Mejoras y correcciones')).toBeInTheDocument();
    expect(within(table).getByText('Mejoras y correcciones Desarrollo')).toBeInTheDocument();
    expect(within(table).getByText('Calculadora Desarrollo')).toBeInTheDocument();
    expect(screen.getByText(/no lo distribuye entre bloques sin evidencia/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Qué explica la diferencia')).not.toBeInTheDocument();
  });

  it('sin plan no muestra porcentajes como si existiese una fecha definida', () => {
    render(<TeamProgressCard progress={{
      ...progress, hasPlan: false, plannedHours: 0, actualHours: 0,
      expectedHours: 0, actualPercent: null, expectedPercent: null,
      phases: [],
    }} teamName="QA" />);
    expect(screen.getByText('Sin plan')).toBeInTheDocument();
    expect(screen.getByText('Sin bloques con HH planificadas para este equipo.')).toBeInTheDocument();
  });
});
