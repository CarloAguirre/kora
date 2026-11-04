import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectExecutionProgress } from '../lib/project-execution-progress';
import { ProjectExecutionProgressCard } from './ProjectExecutionProgressCard';

const block = (id: string, teamName: string, estimatedHours: number,
  actualHours: number, gapPoints: number) => ({
  id, teamId: id + '-team', teamName, name: 'Reportería',
  estimatedHours, actualHours, expectedHours: estimatedHours,
  actualPercent: Math.round(100 * actualHours / estimatedHours),
  expectedPercent: 100, consumedHours: 0, coveragePercent: 100,
  isClosed: false, closedAt: null, approvedDelivery: false,
  pendingApprovalCount: 0, overdueCount: 0, unassignedCount: 1, gapPoints,
});

const progress: ProjectExecutionProgress = {
  hasPlan: true, plannedHours: 607, actualHours: 464, expectedHours: 607,
  actualPercent: 76, expectedPercent: 100, soldHours: 606.5,
  usedHours: 273.5, consumptionPercent: 45,
  unplannedBlockCount: 0, unlinkedTaskCount: 0, blocksCount: 6, taskCount: 6, paused: false,
  phases: [{
    id: 'phase-1', number: 1, name: 'Bot de conciliación',
    estimatedHours: 464, commercialHours: 464, actualHours: 464, expectedHours: 464,
    actualPercent: 100, expectedPercent: 100, consumedHours: 0,
    blocks: [{
      ...block('pmo-1', 'PMO', 24, 24, 0),
      name: 'Bot de conciliación', isClosed: true, closedAt: '2026-10-16T12:00:00Z',
    }, {
      ...block('qa-1', 'QA', 80, 80, 0),
      name: 'Bot de conciliación', isClosed: true, approvedDelivery: true,
    }, {
      ...block('rpa-1', 'RPA', 360, 360, 0),
      name: 'Bot de conciliación', isClosed: true,
    }],
  }, {
    id: 'phase-2', number: 2, name: 'Reportería',
    estimatedHours: 143, commercialHours: 143, actualHours: 0, expectedHours: 143,
    actualPercent: 0, expectedPercent: 100, consumedHours: 0,
    blocks: [
      block('pmo-2', 'PMO', 12, 0, 2),
      block('qa-2', 'QA', 30, 0, 5),
      block('rpa-2', 'RPA', 101, 0, 17),
    ],
  }],
  laggingBlocks: [
    { ...block('rpa-2', 'RPA', 101, 0, 17), phaseName: 'Reportería' },
    { ...block('qa-2', 'QA', 30, 0, 5), phaseName: 'Reportería' },
    { ...block('pmo-2', 'PMO', 12, 0, 2), phaseName: 'Reportería' },
  ],
};

describe('Avance del proyecto — mismo desglose que el equipo', () => {
  it('muestra 76% real, 100% esperado, bloques atrasados y tabla con HH reales', () => {
    render(<ProjectExecutionProgressCard progress={progress} />);
    expect(screen.getByRole('heading', { name: 'Avance del proyecto' })).toBeInTheDocument();
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
    // El mismo 76% aparece en la cifra principal y en su explicación.
    // Verificamos el indicador principal, sin depender de la unicidad del texto.
    expect(screen.getByText('76%', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Avance real 76%; plan a la fecha 100%' }))
      .toBeInTheDocument();
    expect(screen.getByText(/607 HH planificadas frente a 606,5 HH vendidas/))
      .toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Cómo se calcula este avance/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByText('Qué explica la diferencia')).toBeInTheDocument();
    expect(screen.getByText('−17 pts')).toBeInTheDocument();
    expect(screen.getByText('−5 pts')).toBeInTheDocument();
    expect(screen.getByText('−2 pts')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Fase 1: Bot de conciliación')).toBeInTheDocument();
    expect(within(table).getByText('Fase 2: Reportería')).toBeInTheDocument();
    expect(screen.getByText(/Cerrado el 16-10-2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Cerrado por entrega aprobada/).length).toBe(1);
  });

  it('mantiene el desglose desplegable como en la referencia', () => {
    render(<ProjectExecutionProgressCard progress={progress} />);
    const toggle = screen.getByRole('button', { name: /Cómo se calcula este avance/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Qué explica la diferencia')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Qué explica la diferencia')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Qué explica la diferencia')).not.toBeInTheDocument();
  });

  it('no inventa porcentajes cuando los bloques no tienen horas operativas', () => {
    render(<ProjectExecutionProgressCard progress={{
      ...progress, plannedHours: 0, actualHours: 0, expectedHours: 0,
      actualPercent: null, expectedPercent: null, hasPlan: false,
      unplannedBlockCount: 6, phases: [],
      blocksCount: 0, laggingBlocks: [],
    }} />);
    expect(screen.getByText('Sin plan')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sin plan operativo del proyecto' })).toBeInTheDocument();
    expect(screen.queryByText('76%')).not.toBeInTheDocument();
  });

  it('explica atrasos pequeños sin redondearlos a cero y clasifica las HH extra como información', () => {
    const smallGap: ProjectExecutionProgress = {
      ...progress, expectedHours: 5.8, expectedPercent: 1,
      actualHours: 0, actualPercent: 0,
      soldHours: 1000, plannedHours: 1003,
      phases: progress.phases.map((phase) => ({
        ...phase, commercialHours: phase.estimatedHours,
      })),
      laggingBlocks: [
        { ...block('ux-01', 'UX-UI', 120, 0, 0.43), phaseName: 'Diseño y Arquitectura' },
        { ...block('dev-01', 'Desarrollo', 40, 0, 0.14), phaseName: 'Diseño y Arquitectura' },
      ],
    };
    render(<ProjectExecutionProgressCard progress={smallGap} />);
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Cómo se calcula este avance/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByText('Qué explica la diferencia')).toBeInTheDocument();
    expect(screen.getByText('−0,43 pts')).toBeInTheDocument();
    expect(screen.getByText('−0,14 pts')).toBeInTheDocument();
    expect(screen.getByText(/3 HH/)).toBeInTheDocument();
    expect(screen.getByText(/La diferencia no cambia el contrato/)).toBeInTheDocument();
    expect(screen.queryByText(/Las HH de bloques no coinciden con la estimación comercial/))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/No hay bloques atrasados respecto del plan/))
      .not.toBeInTheDocument();
  });

  it('indica pausa y no etiqueta atraso aunque exista brecha', () => {
    render(<ProjectExecutionProgressCard progress={{ ...progress, paused: true }} />);
    expect(screen.getByText('Pausado')).toBeInTheDocument();
    expect(screen.queryByText('Atrasado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cómo se calcula este avance/i }));
    expect(screen.getByText(/no se califica la diferencia como atraso/)).toBeInTheDocument();
  });
});
