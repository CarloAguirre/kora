import type { ProjectPhaseOption } from '@kora/contracts';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectHourPlanFields } from './ProjectHourPlanFields';
import {
  OTHER_TASK_OPTION, activityForTaskChange, formatTaskHourSummary, resolveHourApprover, toHourTaskId,
} from './hour-task-selection';

const tasks = [
  { id: 'task-1', name: 'Modelo de datos', estimatedHours: 10, actualHours: 3, pendingHours: 2 },
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
    expect(screen.getByText('2 HH pendientes de aprobación')).toBeInTheDocument();
    expect(screen.getByText(/Solo las aprobadas se suman a las reales del Roadmap/)).toBeInTheDocument();
    expect(screen.getByText('Aprobador: Eduardo Aranda')).toBeInTheDocument();
  });

  it('muestra al líder antes de la fase solo cuando es unívoco para las tareas del colaborador', () => {
    const phase = {
      id: 'phase-1', name: 'Desarrollo', currentStage: 'development',
      segments: [{ ...segments[0]!, leaderName: 'Eduardo Aranda' }],
      tasks: [{
        id: 'task-1', name: 'Modelo de datos', teamId: 'team-1',
        segmentId: 'segment-1', assigneeUserId: 'user-1', cancelledAt: null,
      }],
    };
    expect(resolveHourApprover([phase] as unknown as ProjectPhaseOption[], 'user-1')).toBe('Eduardo Aranda');
    expect(resolveHourApprover([phase] as unknown as ProjectPhaseOption[], 'unassigned')).toBeNull();
    const ambiguous = {
      ...phase,
      segments: [...phase.segments, {
        ...segments[0]!, id: 'segment-2', leaderName: 'Otro líder',
      }],
      tasks: [...phase.tasks, {
        ...phase.tasks[0]!, id: 'task-2', segmentId: 'segment-2',
      }],
    };
    expect(resolveHourApprover([ambiguous] as unknown as ProjectPhaseOption[], 'user-1')).toBeNull();
    expect(resolveHourApprover([ambiguous] as unknown as ProjectPhaseOption[], 'user-1', 'segment-2')).toBe('Otro líder');
  });

  it('ofrece tareas incluso cuando la fase no tiene bloques disponibles', () => {
    const props = callbacks();
    render(<ProjectHourPlanFields phases={phases} phaseId="phase-1"
      segments={[]} segmentId="" tasks={tasks} taskId=""
      requiresPhase {...props} />);
    expect(screen.queryByLabelText('Bloque de trabajo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tarea')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Modelo de datos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Asignar a otra/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tarea'),
      { target: { value: OTHER_TASK_OPTION } });
    expect(props.onTaskChange).toHaveBeenCalledWith(OTHER_TASK_OPTION);
  });

  it('deja «Asignar a otra» aun cuando no existen tareas del usuario', () => {
    render(<ProjectHourPlanFields phases={phases} phaseId="phase-1"
      segments={[]} segmentId="" tasks={[]} taskId=""
      requiresPhase {...callbacks()} />);
    expect(screen.getByLabelText('Tarea')).toBeEnabled();
    expect(screen.getAllByRole('option')).toEqual(expect.arrayContaining([
      expect.objectContaining({ textContent: 'Asignar a otra (sin tarea vinculada)' }),
    ]));
  });

  it('permite elegir explícitamente Asignar a otra sin enviar un ID inexistente', () => {
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
