import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectExecutionProgressCard } from './ProjectExecutionProgressCard';
import type { ProjectExecutionProgress } from '../lib/project-execution-progress';

const noPlan: ProjectExecutionProgress = {
  hasPlan: false, plannedHours: 0, actualHours: 0, expectedHours: 0,
  actualPercent: null, expectedPercent: null, soldHours: 2489, usedHours: 5143.75,
  consumptionPercent: 100, paused: false, unplannedBlockCount: 1,
  unlinkedTaskCount: 1, blocksCount: 1, taskCount: 1, phases: [], laggingBlocks: [],
};

describe('ProjectExecutionProgressCard — fallback solo sin plan operativo', () => {
  it('muestra plazo calendario, nunca afirma que es avance real', () => {
    render(<ProjectExecutionProgressCard progress={noPlan} scheduleElapsedPercent={85} />);
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('del plazo transcurrido')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Plazo calendario transcurrido 85%/i })).toBeTruthy();
    expect(screen.getByText('Sin plan')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cómo se calcula este avance/i }));
    expect(screen.getByText(/exclusivamente/)).toBeTruthy();
    expect(screen.getByText(/207% del presupuesto/)).toBeTruthy();
  });

  it('mantiene el estado original si no hay fechas y tampoco hay plan', () => {
    render(<ProjectExecutionProgressCard progress={noPlan} />);
    expect(screen.queryByText('del plazo transcurrido')).toBeNull();
    expect(screen.getByRole('img', { name: 'Sin plan operativo del proyecto' })).toBeTruthy();
  });

  it('un plan con HH mantiene avance real y esperado aunque reciba fallback', () => {
    render(<ProjectExecutionProgressCard progress={{
      ...noPlan, hasPlan: true, plannedHours: 100,
      actualHours: 40, expectedHours: 60, actualPercent: 40, expectedPercent: 60,
    }} scheduleElapsedPercent={85} />);
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('del plan completado')).toBeTruthy();
    expect(screen.queryByText('del plazo transcurrido')).toBeNull();
    expect(screen.getByRole('img', { name: /Avance real 40%; plan a la fecha 60%/i })).toBeTruthy();
  });
});
