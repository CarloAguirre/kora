import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MyProjectDetailPage } from './MyProjectDetailPage';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), roadmap: vi.fn() }));
vi.mock('../api/projects.queries', () => ({ useMyProjectDetail: mocks.detail }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/modules/client-portal/adapters/project-detail.adapter', () => ({
  toPhaseRoadmap: mocks.roadmap,
}));
vi.mock('@/modules/client-portal/components/PhaseRoadmap', () => ({
  PhaseRoadmap: ({ operationalView, toolbarActions, onPlanOperationalRow }: {
    operationalView: boolean; toolbarActions?: React.ReactNode; onPlanOperationalRow?: () => void;
  }) => <div data-testid="visor-roadmap">{operationalView ? 'Vista operativa' : 'Vista general'}
    {toolbarActions ? 'CON_EDICION' : ''}{onPlanOperationalRow ? 'CON_PLANIFICACION' : ''}</div>,
}));
vi.mock('../components/MyProjectBitacora', () => ({
  MyProjectBitacora: () => <div>Bitácora en consulta</div>,
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
    expect(screen.getByTestId('visor-roadmap')).toHaveTextContent('Vista operativa');
    expect(screen.queryByText('CON_EDICION')).not.toBeInTheDocument();
    expect(screen.queryByText('CON_PLANIFICACION')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Bitácora' }));
    expect(screen.getByText('Bitácora en consulta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /planificar|editar|agregar/i })).not.toBeInTheDocument();
    expect(mocks.detail).toHaveBeenCalledWith('p-1');
  });
});
