import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectHourPlanFields } from './ProjectHourPlanFields';
import {
  OTHER_TASK_OPTION, activityForTaskChange, formatTaskHourSummary, toHourTaskId,
} from './hour-task-selection';

const tasks = [
  { id: 'task-1', name: 'Modelo de datos', estimatedHours: 10, actualHours: 3 },
  { id: 'task-2', name: 'Interfaz', estimatedHours: 24, actualHours: null },
];
const phases = [{ id: 'phase-1', name: 'Mejoras y correcciones' }];
const segments = [{ id: 'segment-1', name: 'Calculadora', teamName: 'Desarrollo',
  startDate: '2026-11-01', endDate: '2026-11-30' }];
const callbacks = () => ({ onPhaseChange: vi.fn(), onSegmentChange: vi.fn(), onTaskChange: vi.fn() });

describe('Vincula estas horas al plan', () => {
  it('muestra solo fase al inicio y luego fase, bloque y tarea en la misma sección', () => {
    const props = callbacks();
    const { rerender, container } = render(<ProjectHourPlanFields
      phases={phases} phaseId="" segments={segments} segmentId="" tasks={[]}
      taskId="" requiresPhase {...props} />);
    expect(screen.getByRole('region', { name: 'Vincula estas horas al plan' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Fase/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Bloque de trabajo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Fase/), { target: { value: 'phase-1' } });
    expect(props.onPhaseChange).toHaveBeenCalledWith('phase-1');
    rerender(<ProjectHourPlanFields phases={phases} phaseId="phase-1"
      segments={segments} segmentId="segment-1" tasks={tasks} taskId="task-1"
      requiresPhase approverName="Eduardo Aranda" {...props} />);
    expect(container.querySelector('[class*="planFieldsTriple"]')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Bloque de trabajo/)).toHaveValue('segment-1');
    expect(screen.getByLabelText(/^Tarea/)).toHaveValue('task-1');
    expect(screen.getByText('3 de 10 HH aprobadas')).toBeInTheDocument();
    expect(screen.getByText(/Solo las aprobadas se suman a las reales del Roadmap/)).toBeInTheDocument();
    expect(screen.getByText('Aprobador: Eduardo Aranda')).toBeInTheDocument();
  });

  it('permite elegir explícitamente Otro trabajo del bloque sin enviar un ID inexistente', () => {
    const props = callbacks();
    render(<ProjectHourPlanFields phases={phases} phaseId="phase-1"
      segments={segments} segmentId="segment-1" tasks={tasks}
      taskId="" requiresPhase {...props} />);
    fireEvent.change(screen.getByLabelText(/^Tarea/), { target: { value: OTHER_TASK_OPTION } });
    expect(props.onTaskChange).toHaveBeenCalledWith(OTHER_TASK_OPTION);
    expect(toHourTaskId(OTHER_TASK_OPTION)).toBeUndefined();
    expect(toHourTaskId('task-1')).toBe('task-1');
    expect(formatTaskHourSummary(null, 10)).toBe('0 de 10 HH aprobadas');
    expect(activityForTaskChange('Modelo de datos', 'Modelo de datos', undefined)).toBe('');
    expect(activityForTaskChange('Escribí documentación', 'Modelo de datos', undefined))
      .toBe('Escribí documentación');
    expect(activityForTaskChange('', undefined, 'Modelo de datos')).toBe('Modelo de datos');
  });
});
