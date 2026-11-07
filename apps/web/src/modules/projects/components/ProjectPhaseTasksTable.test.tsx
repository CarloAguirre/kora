import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AppliedQuotationPlanning, ProjectModule } from '@kora/contracts';
import { ProjectPhaseTasksTable } from './ProjectPhaseTasksTable';

const module = {
  id: 'phase-1', name: 'Diseño y Arquitectura',
  segments: [{ id: 'segment-1', teamId: 'team-1', teamName: 'UX-UI',
    name: 'S1 - Diseño y Arquitectura', startDate: '2026-11-04', endDate: '2026-12-01' }],
  tasks: [
    { id: 'task-1', name: 'Análisis de flujos existentes',
      teamId: 'team-1', segmentId: 'segment-1', assigneeUserId: 'u-1',
      assigneeName: 'Leslie Galaz', status: 'done', date: '2026-11-15', description: null,
      rejectionReason: null, cancelledAt: null },
    { id: 'task-2', name: 'Corrección de filtros', teamId: 'team-1',
      segmentId: 'segment-1', assigneeUserId: 'u-2', assigneeName: 'Claudio Flores',
      status: 'in_progress', date: '2099-11-15', description: null,
      rejectionReason: null, cancelledAt: null },
  ],
  deliveries: [],
} as unknown as ProjectModule;

describe('Tabla operativa compartida de tareas', () => {
  it('en modo colaborador conserva columnas, asignados y estados; nunca ofrece gestión', () => {
    const onEditTask = vi.fn();
    const onDeleteTask = vi.fn();
    const onAddTask = vi.fn();
    render(<ProjectPhaseTasksTable module={module}
      canManage readOnly onEditTask={onEditTask} onDeleteTask={onDeleteTask}
      onAddTask={onAddTask} />);
    expect(screen.getByText('Tareas')).toBeInTheDocument();
    expect(screen.getByText(/2, 1 aprobadas/)).toBeInTheDocument();
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Tarea', 'Asignada a', 'Bloque de trabajo', 'Estado', 'Fecha límite']);
    expect(within(table).getByText('Análisis de flujos existentes')).toBeInTheDocument();
    expect(within(table).getByText('Leslie Galaz')).toBeInTheDocument();
    // Ambas tareas pertenecen al mismo bloque; debe aparecer en las dos filas.
    expect(within(table).getAllByText('S1 - Diseño y Arquitectura')).toHaveLength(2);
    expect(within(table).getByText('Aprobada')).toBeInTheDocument();
    expect(within(table).getByText('En curso')).toBeInTheDocument();
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
    expect(onEditTask).not.toHaveBeenCalled();
    expect(onDeleteTask).not.toHaveBeenCalled();
    expect(onAddTask).not.toHaveBeenCalled();
  });
  it('usa Badge nativo y conserva etiquetas adicionales y referencias sin asignación', () => {
    const altered = {
      ...module,
      tasks: [
        { ...module.tasks[0]!, status: 'in_review', date: '2099-11-15' },
        { ...module.tasks[1]!, status: 'in_progress', date: '2020-01-01',
          rejectionReason: 'Corregir validaciones' },
        { ...module.tasks[1]!, id: 'task-3', name: 'Sin asignación',
          assigneeUserId: null, status: 'todo', date: '2020-01-01' },
        { ...module.tasks[0]!, id: 'task-4', name: 'Tarea aprobada',
          status: 'done', date: '2020-01-01' },
      ],
    } as ProjectModule;
    render(<ProjectPhaseTasksTable module={altered} canManage={false} />);
    for (const [label, tone] of [
      ['Completada', 'warning'], ['En curso', 'info'], ['Devuelta', 'warning'],
      ['Vencida', 'danger'], ['Por asignar', 'unassigned'], ['Aprobada', 'success'],
    ] as const) {
      const badge = screen.getByText(label);
      expect(badge.className).toContain('badge');
      expect(badge.className).toContain(tone);
    }
    expect(screen.getByText('Devuelta').parentElement)
      .toHaveAttribute('title', 'Corregir validaciones');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('usa Button ghost icon y tertiary con los mismos callbacks y etiquetas accesibles', () => {
    const onEditTask = vi.fn(), onDuplicateTask = vi.fn(),
      onDeleteTask = vi.fn(), onAddTask = vi.fn();
    render(<ProjectPhaseTasksTable module={module} canManage
      onEditTask={onEditTask} onDuplicateTask={onDuplicateTask}
      onDeleteTask={onDeleteTask} onAddTask={onAddTask} />);
    for (const name of [
      'Editar tarea Análisis de flujos existentes',
      'Duplicar tarea Análisis de flujos existentes',
      'Eliminar tarea Análisis de flujos existentes',
    ]) {
      const action = screen.getByRole('button', { name });
      expect(action.className).toContain('ghost');
      expect(action.className).toContain('icon');
      expect(action).toHaveAttribute('type', 'button');
      expect(action).toBeEnabled();
    }
    fireEvent.click(screen.getByRole('button', {
      name: 'Editar tarea Análisis de flujos existentes',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Duplicar tarea Análisis de flujos existentes',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Eliminar tarea Análisis de flujos existentes',
    }));
    const add = screen.getByRole('button', { name: '+ Agregar tarea' });
    expect(add.className).toContain('tertiary');
    fireEvent.click(add);
    expect(onEditTask).toHaveBeenCalledWith(module.tasks[0]);
    expect(onDuplicateTask).toHaveBeenCalledWith(module.tasks[0]);
    expect(onDeleteTask).toHaveBeenCalledWith(module.tasks[0]);
    expect(onAddTask).toHaveBeenCalledOnce();
  });

  it('conserva botones EDT con eliminación bloqueada y nunca da gestión sin canManage', () => {
    const reference = {
      wbs: 'WBS-UI-1', name: 'Referencia EDT', role: 'QA',
      teamId: 'team-1', hours: 8,
    } as unknown as AppliedQuotationPlanning['modules'][number]['tasks'][number];
    const onDeleteReference = vi.fn();
    const { rerender } = render(<ProjectPhaseTasksTable module={module} canManage
      references={[reference]} onDeleteReference={onDeleteReference}
      referenceDeletePending />);
    const edit = screen.getByRole('button', { name: 'Editar tarea Referencia EDT' });
    const remove = screen.getByRole('button', { name: 'Eliminar tarea Referencia EDT' });
    expect(edit.className).toContain('ghost');
    expect(remove.className).toContain('ghost');
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(onDeleteReference).not.toHaveBeenCalled();
    rerender(<ProjectPhaseTasksTable module={module} canManage={false}
      references={[reference]} onDeleteReference={onDeleteReference} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

});
