import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { ProjectModulesCard } from './ProjectModulesCard';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  createSegment: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/modules/client-portal/adapters/project-detail.adapter', () => ({
  roleFromTeamName: () => 'dev',
  toPhaseRoadmap: () => ({
    phaseCount: 1, teamSegmentCount: 0, plannedDeliveryCount: 0,
    rangeStartDate: '2026-11-01', rangeEndDate: '2026-12-01',
    phases: [{ id: 'module-1', name: 'Diseño Backend', badge: 'FASE 2',
      status: 'upcoming', alertLabel: null, tasks: [], deliveries: [],
      taskItems: [], relatedBitacora: [] }],
  }),
}));
vi.mock('@/modules/client-portal/components/PhaseRoadmap', () => ({
  PhaseRoadmap: ({ phaseRoadmap, toolbarActions, renderPhaseHeaderName, renderPhaseHeaderActions }: {
    phaseRoadmap: { phases: { id: string }[] };
    toolbarActions?: ReactNode;
    renderPhaseHeaderName?: (phase: { id: string }) => ReactNode;
    renderPhaseHeaderActions?: (phase: { id: string }) => ReactNode;
  }) => {
    const phase = phaseRoadmap.phases[0]!;
    return <section>{toolbarActions}{renderPhaseHeaderName?.(phase)}
      {renderPhaseHeaderActions?.(phase)}</section>;
  },
}));
vi.mock('../api/projects.queries', () => ({
  useUpdateProjectModule: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteProjectModule: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useUpdateProjectModuleSegment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateProjectModuleSegment: () => ({ mutateAsync: mocks.createSegment, isPending: false }),
  useDeleteProjectModuleSegment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProjectModuleDelivery: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/modules/estimation/api/quotation.queries', () => ({
  useAppliedQuotationPlanning: () => ({ data: { modules: [] } }),
}));
vi.mock('@/shared/components/ui/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirm: mocks.confirm, dialog: null }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('./ExecutionSegmentModal', () => ({
  EMPTY_EXECUTION_SEGMENT_MODAL_VALUES: { teamId: '', name: '', startDate: '',
    endDate: '', members: [] },
  segmentToModalValues: () => ({}),
  toSegmentInput: (values: unknown) => values,
  ExecutionSegmentModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Nuevo bloque de trabajo">Formulario de bloque</div> : null,
}));

const module = {
  id: 'module-1', name: 'Diseño Backend',
  progress: { actual: 25, expected: 40, scopes: {}, estimatedByCount: false },
  initialStage: 'development', currentStage: 'development',
  estimatedHours: 120, estimatedStartDate: null, estimatedEndDate: null,
  segments: [], deliveries: [], tasks: [], blockerCount: 0,
};
const project = { id: 'project-1', modules: [module] } as unknown as ProjectDetail;
const show = (p: ProjectDetail = project) => render(
  <ProjectModulesCard project={p} hourEntries={[]}
    teamOptions={[{ value: 'team-1', label: 'Desarrollo' }]} canManage />,
);

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.createSegment.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe('Cabecera de las fases · HTML v5', () => {
  it('muestra avance real y plan automático, y habilita Planificar sin afectar la vista', () => {
    show();
    expect(screen.getByText('25% real · 40% plan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Bloque de trabajo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase Diseño Backend' }))
      .toHaveValue('Diseño Backend');
    expect(screen.getByRole('button', { name: '+ Bloque de trabajo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar fase Diseño Backend' })).toBeEnabled();
  });

  it('persiste el nombre mediante la mutación de fases ya existente', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    const input = screen.getByRole('textbox', { name: 'Nombre de la fase Diseño Backend' });
    fireEvent.change(input, { target: { value: 'Backend e Integraciones' } });
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', input: { name: 'Backend e Integraciones' },
    }));
  });

  it('reutiliza el modal de bloques operativos para agregar bloque de trabajo', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Bloque de trabajo' }));
    expect(screen.getByRole('dialog', { name: 'Nuevo bloque de trabajo' })).toBeInTheDocument();
  });

  it('solicita confirmación y elimina solo una fase vacía', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar fase Diseño Backend' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
    }));
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it('bloquea borrado de fases que contienen trabajo operativo', () => {
    show({ ...project, modules: [{ ...module, tasks: [{ id: 'task-1' }] }] } as unknown as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    expect(screen.getByRole('button', { name: 'Eliminar fase Diseño Backend' })).toBeDisabled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
