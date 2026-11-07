import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ProjectModule } from '@kora/contracts';
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

});
