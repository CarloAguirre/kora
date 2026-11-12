import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MyProjectDetailPage } from './MyProjectDetailPage';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), roadmap: vi.fn() }));
vi.mock('../api/projects.queries', () => ({ useMyProjectDetail: mocks.detail }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/modules/client-portal/adapters/project-detail.adapter', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/modules/client-portal/adapters/project-detail.adapter')>(),
  toPhaseRoadmap: mocks.roadmap,
}));
vi.mock('@/modules/client-portal/components/PhaseRoadmap', () => ({
  PhaseRoadmap: ({ operationalView, toolbarActions, onPlanOperationalRow,
    renderPhaseReferences, renderSelectionDetail }: {
    operationalView: boolean; toolbarActions?: ReactNode; onPlanOperationalRow?: () => void;
    renderPhaseReferences?: (phase: { id: string }) => ReactNode;
    renderSelectionDetail?: (phase: { id: string },
      selection: { kind: 'segment' | 'task'; id: string; label: string }, close: () => void) => ReactNode;
  }) => {
    const [selected, setSelected] = useState<'segment' | 'task' | null>(null);
    const phase = { id: 'm-1' };
    return <div data-testid="visor-roadmap">
      {operationalView ? 'Vista operativa' : 'Vista general'}
      {toolbarActions ? 'CON_EDICION' : ''}{onPlanOperationalRow ? 'CON_PLANIFICACION' : ''}
      {renderPhaseReferences?.(phase)}
      <button type="button" onClick={() => setSelected('segment')}>Abrir bloque de trabajo</button>
      <button type="button" onClick={() => setSelected('task')}>Abrir tarea de fase</button>
      {selected && renderSelectionDetail?.(phase, selected === 'task' ? {
        kind: 'task', id: 'task-1', label: 'Revisar prototipo',
      } : {
        kind: 'segment', id: 'segment-1', label: 'Diseño de flujos',
      }, () => setSelected(null))}
    </div>;
  },
}));
vi.mock('../components/MyProjectBitacora', () => ({
  MyProjectBitacora: () => <div>Bitácora en consulta</div>,
}));
vi.mock('../components/ProjectPhaseTasksTable', () => ({
  ProjectPhaseTasksTable: ({ readOnly, canManage }: { readOnly: boolean; canManage: boolean }) =>
    <div data-testid="task-table">{readOnly && !canManage ? 'Tareas en consulta' : 'EDICION ACTIVADA'}</div>,
}));
vi.mock('../components/SegmentDrawer', () => ({
  SegmentDrawer: ({ readOnly, onEdit, onDelete, onClose }: {
    readOnly: boolean; onEdit?: () => void; onDelete?: () => void; onClose: () => void;
  }) => <div role="dialog" aria-label="Detalle del bloque">
    {readOnly && !onEdit && !onDelete ? 'Panel de solo lectura' : 'EDICION ACTIVADA'}
    <button type="button" onClick={onClose}>Cerrar panel</button>
  </div>,
}));

describe('Detalle de proyecto del colaborador', () => {
  it('muestra roadmap operativo y bitácora, sin acciones de planificación ni edición', () => {
    mocks.roadmap.mockReturnValue({ phases: [{ id: 'm-1', name: 'Fase 1' }], rangeStartDate: '', rangeEndDate: '' });
    mocks.detail.mockReturnValue({ isLoading: false, error: null, data: {
      id: 'p-1', name: 'Mejoras Kora', type: 'development', status: 'active',
      phase: null, progress: { actual: 19, expected: 41 },
      client: { id: 'c-1', companyName: 'Kabeli' },
      leader: { id: 'l-1', fullName: 'Solmari Castro' },
      startDate: '2026-10-19', endDate: '2026-11-20',
      modules: [{ id: 'm-1', segments: [], tasks: [], deliveries: [] }],
      observations: [], events: [], activityTruncated: false,
    } });
    render(<MemoryRouter initialEntries={['/mis-proyectos/p-1']}>
      <Routes><Route path="/mis-proyectos/:projectId" element={<MyProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText('Mejoras Kora')).toBeInTheDocument();
    const stage = screen.getByText('Activo');
    expect(stage).toHaveClass('stageBadge');
    expect(screen.getByTestId('visor-roadmap')).toHaveTextContent('Vista operativa');
    expect(screen.queryByText('CON_EDICION')).not.toBeInTheDocument();
    expect(screen.queryByText('CON_PLANIFICACION')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Bitácora' }));
    expect(screen.getByText('Bitácora en consulta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /planificar|editar|agregar/i })).not.toBeInTheDocument();
    expect(mocks.detail).toHaveBeenCalledWith('p-1');
  });

  it('reutiliza el drawer de bloque en solo lectura y muestra la tabla dentro de cada fase', () => {
    mocks.roadmap.mockReturnValue({
      phases: [{ id: 'm-1', name: 'Fase 1' }],
      rangeStartDate: '2026-10-01', rangeEndDate: '2026-12-01',
    });
    mocks.detail.mockReturnValue({ isLoading: false, error: null, data: {
      id: 'p-1', name: 'Mejoras Kora', slug: 'mejoras-kora', type: 'development',
      status: 'active', phase: null, progress: { actual: 19, expected: 41 },
      client: { id: 'c-1', companyName: 'Kabeli' },
      leader: { id: 'l-1', fullName: 'Solmari Castro' },
      startDate: '2026-10-19', endDate: '2026-11-20',
      teams: [{ teamId: 'team-1', leader: { id: 'leader-1', fullName: 'Eduardo Aranda' } }],
      modules: [{
        id: 'm-1', name: 'Diseño y Arquitectura',
        progress: { actual: 30, expected: 60 },
        estimatedHours: 160, estimatedStartDate: null, estimatedEndDate: null,
        segments: [{
          id: 'segment-1', teamId: 'team-1', name: 'Diseño de flujos',
          teamName: 'UX-UI', startDate: '2026-10-19', endDate: '2026-11-04',
          estimatedHours: 120, consumedHours: 0, members: [],
        }],
        tasks: [{
          id: 'task-1', name: 'Revisar prototipo', teamName: 'UX-UI',
          status: 'in_progress', assigneeName: 'Leslie Galaz',
          date: '2026-12-01', startDate: '2026-11-04', scope: 'desarrollo',
          estimatedHours: 2, description: 'Revisar el diseño de interfaz.',
          completedAt: null, rejectionReason: null,
        }], deliveries: [],
      }],
      observations: [], events: [], activityTruncated: false,
    } });
    render(<MemoryRouter initialEntries={['/mis-proyectos/p-1']}>
      <Routes><Route path="/mis-proyectos/:projectId" element={<MyProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByTestId('task-table')).toHaveTextContent('Tareas en consulta');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir bloque de trabajo' }));
    expect(screen.getByRole('dialog', { name: 'Detalle del bloque' }))
      .toHaveTextContent('Panel de solo lectura');
    expect(screen.queryByText('EDICION ACTIVADA')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(screen.queryByRole('dialog', { name: 'Detalle del bloque' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir tarea de fase' }));
    const taskDetail = screen.getByRole('region', { name: 'Tarea: Revisar prototipo' });
    expect(taskDetail).toHaveTextContent('Leslie Galaz');
    expect(taskDetail).toHaveTextContent('En curso');
    expect(taskDetail).toHaveTextContent('Inicio');
    expect(taskDetail).toHaveTextContent('Fecha límite');
    expect(taskDetail).toHaveTextContent('Ámbito');
    expect(taskDetail).toHaveTextContent('Horas estimadas');
    expect(taskDetail).toHaveTextContent('Revisar el diseño de interfaz.');
    expect(within(taskDetail).queryByRole('button', { name: /editar|eliminar|aprobar/i }))
      .not.toBeInTheDocument();
    fireEvent.click(within(taskDetail).getByRole('button', { name: 'Cerrar detalle' }));
    expect(screen.queryByRole('region', { name: 'Tarea: Revisar prototipo' }))
      .not.toBeInTheDocument();
  });
  it('App Walvy sin HH de bloques muestra plazo calendario en el detalle del colaborador', () => {
    mocks.roadmap.mockReturnValue({ phases: [], rangeStartDate: '', rangeEndDate: '' });
    mocks.detail.mockReturnValue({ isLoading: false, error: null, data: {
      id: 'p-walvy', name: 'App Walvy', slug: 'app-walvy', type: 'development',
      status: 'active', phase: 'development',
      progress: { actual: null, expected: null },
      client: { id: 'c-1', companyName: 'Edificate Inteligente' },
      leader: null, startDate: '2026-03-30', endDate: '2026-12-21',
      modules: [], observations: [], events: [], activityTruncated: false,
    } });
    render(<MemoryRouter initialEntries={['/mis-proyectos/app-walvy']}>
      <Routes><Route path="/mis-proyectos/:projectId" element={<MyProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText('del plazo transcurrido')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Plazo calendario transcurrido/ })).toBeInTheDocument();
    expect(screen.queryByText(/El avance se mostrará apenas el plan de trabajo/)).not.toBeInTheDocument();
  });

  it('con avance operativo real conserva las barras de plan y real', () => {
    mocks.roadmap.mockReturnValue({ phases: [], rangeStartDate: '', rangeEndDate: '' });
    mocks.detail.mockReturnValue({ isLoading: false, error: null, data: {
      id: 'p-plan', name: 'Con plan', type: 'development',
      status: 'active', phase: null,
      progress: { actual: 40, expected: 60 },
      client: null, leader: null, startDate: '2026-01-01', endDate: '2026-12-31',
      modules: [], observations: [], events: [], activityTruncated: false,
    } });
    render(<MemoryRouter initialEntries={['/mis-proyectos/con-plan']}>
      <Routes><Route path="/mis-proyectos/:projectId" element={<MyProjectDetailPage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText('del proyecto completado')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Avance real 40%, planificado a la fecha 60%/ })).toBeInTheDocument();
    expect(screen.queryByText('del plazo transcurrido')).not.toBeInTheDocument();
  });
});
