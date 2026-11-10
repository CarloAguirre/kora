import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { MemoryRouter } from 'react-router-dom';
import { ProjectModulesCard } from './ProjectModulesCard';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
  removeTask: vi.fn(),
  createSegment: vi.fn(),
  excludeReference: vi.fn(),
  excluded: [] as Array<{ moduleId: string; versionId: string; wbs: string; role: string }>,
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  appliedPlan: { versionId: 'version-1', modules: [] as Array<{
    moduleId: string;
    tasks: Array<unknown>;
    relativeTeamBlocks: Array<{
      teamId: string; hours: number; startWeek: number; durationWeeks: number;
    }>;
    totalHours: number;
  }> },
}));
vi.mock('@/modules/client-portal/adapters/project-detail.adapter', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/modules/client-portal/adapters/project-detail.adapter')>(),
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
  PhaseRoadmap: ({ phaseRoadmap, toolbarActions, renderPhaseHeaderName,
    renderPhaseHeaderActions, renderPhaseReferences, operationalRows, onPlanOperationalRow, operationalFooter,
    renderSelectionDetail, operationalPresaleHours, operationalNotice }: {
    phaseRoadmap: { phases: { id: string }[]; rangeStartDate: string; rangeEndDate: string };
    toolbarActions?: ReactNode;
    operationalNotice?: ReactNode;
    renderPhaseHeaderName?: (phase: { id: string }) => ReactNode;
    renderPhaseHeaderActions?: (phase: { id: string }) => ReactNode;
    renderPhaseReferences?: (phase: { id: string }) => ReactNode;
    operationalRows?: (phase: { id: string }) => Array<{
      id: string; label: string; hours: number; proposedStartDate?: string; proposedEndDate?: string;
    }>;
    onPlanOperationalRow?: (phase: { id: string }, row: { id: string; label: string; hours: number }) => void;
    operationalFooter?: ReactNode;
    operationalPresaleHours?: number | null;
    renderSelectionDetail?: (phase: { id: string },
      selection: { kind: 'reference-block' | 'segment'; id: string; label: string },
      close: () => void) => ReactNode;
  }) => {
    const phase = phaseRoadmap.phases[0]!;
    const [selection, setSelection] = useState<{
      kind: 'reference-block' | 'segment'; id: string; label: string;
    } | null>(null);
    return <section>
      <output data-testid="roadmap-date-range">
        {phaseRoadmap.rangeStartDate} → {phaseRoadmap.rangeEndDate}
      </output>
      {operationalPresaleHours != null && <output data-testid="presale-hours">{operationalPresaleHours}</output>}
      {toolbarActions}{operationalNotice}{renderPhaseHeaderName?.(phase)}
      {renderPhaseHeaderActions?.(phase)}
      {operationalRows?.(phase).map((row) => <div key={row.id}>{row.label}
        {row.proposedStartDate && row.proposedEndDate && <output data-testid="dates-propuesta">
          {row.proposedStartDate} → {row.proposedEndDate}
        </output>}
        <button type="button" onClick={() => setSelection({
          kind: 'reference-block', id: row.id, label: row.label,
        })}>Abrir bloque {row.label}</button>
        {onPlanOperationalRow && <button type="button"
          onClick={() => onPlanOperationalRow(phase, row)}>Planificar bloque</button>}
      </div>)}
      {renderPhaseReferences?.(phase)}
      {renderSelectionDetail && <button type="button" onClick={() => setSelection({
        kind: 'segment', id: 'segment-real-1', label: 'Bloque operativo',
      })}>Abrir segmento operativo</button>}
      {selection && renderSelectionDetail?.(phase, selection, () => setSelection(null))}
      {operationalFooter}</section>;
  },
}));
vi.mock('../api/projects.queries', () => ({
  useCreateProjectModule: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateProjectModule: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteProjectModule: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useUpdateProjectModuleSegment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateProjectModuleSegment: () => ({ mutateAsync: mocks.createSegment, isPending: false }),
  useDeleteProjectModuleSegment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProjectModuleDelivery: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProjectModuleTask: () => ({ mutateAsync: mocks.updateTask, isPending: false }),
  useCreateProjectModuleTask: () => ({ mutateAsync: mocks.createTask, isPending: false }),
  useDeleteProjectModuleTask: () => ({ mutateAsync: mocks.removeTask, isPending: false }),
  useRoadmapReferenceExclusions: () => ({ data: mocks.excluded }),
  useExcludeRoadmapReference: () => ({ mutateAsync: mocks.excludeReference, isPending: false }),
}));
vi.mock('@/modules/estimation/api/quotation.queries', () => ({
  useAppliedQuotationPlanning: () => ({ data: mocks.appliedPlan }),
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
const project = { id: 'project-1', modules: [module], teams: [{
  teamId: 'team-1', teamName: 'Desarrollo', leader: null, memberCount: 0,
  maxMembers: 2, assignedHours: 160,
}], members: [] } as unknown as ProjectDetail;
const show = (p: ProjectDetail = project, options?: {
  teamOptions?: Array<{ value: string; label: string }>;
  canManage?: boolean;
  onNavigateToTeams?: () => void;
}) => render(
  <MemoryRouter><ProjectModulesCard project={p} hourEntries={[]}
    teamOptions={options?.teamOptions ?? [{ value: 'team-1', label: 'Desarrollo' }]}
    canManage={options?.canManage ?? true}
    onNavigateToTeams={options?.onNavigateToTeams} /></MemoryRouter>,
);

const inputHasInlinePlanningClass = () =>
  Boolean(screen.getByRole('textbox', { name: 'Nombre de la fase Diseño Backend' })
    .parentElement?.className.includes('phaseHeadingIdentityPlanning'));

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReset().mockResolvedValue({ id: 'module-new' });
  mocks.updateTask.mockReset().mockResolvedValue(undefined);
  mocks.createTask.mockReset().mockResolvedValue(undefined);
  mocks.removeTask.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.createSegment.mockReset().mockResolvedValue(undefined);
  mocks.excludeReference.mockReset().mockResolvedValue(undefined);
  mocks.excluded = [];
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.success.mockReset();
  mocks.error.mockReset();
  mocks.appliedPlan.modules = [];
});

describe('Roadmap vacío · creación guiada y equipos asignados', () => {
  const emptyProject = () => ({
    ...project, modules: [], teams: [], members: [],
  } as unknown as ProjectDetail);

  it('muestra los tres pasos y el resumen vacío sin depender de Editar proyecto', () => {
    show(emptyProject(), { teamOptions: [] });
    const empty = screen.getByRole('region', { name: 'Roadmap sin fases' });
    expect(within(empty).getByText('0 fases')).toBeInTheDocument();
    expect(within(empty).getByText('0 bloques de trabajo')).toBeInTheDocument();
    expect(within(empty).getByText('0 tareas')).toBeInTheDocument();
    expect(within(empty).getByRole('heading', { name: 'Arma el plan del proyecto' }))
      .toBeInTheDocument();
    expect(within(empty).getByText('Crea una fase')).toBeInTheDocument();
    expect(within(empty).getByText('Agrega bloques de trabajo')).toBeInTheDocument();
    expect(within(empty).getByText('Desglosa en tareas')).toBeInTheDocument();
    expect(within(empty).getByRole('button', { name: 'Planificar' }))
      .toHaveAttribute('aria-pressed', 'true');
    const mode = within(empty).getByRole('group', { name: 'Modo del Roadmap' });
    expect(within(mode).getByRole('button', { name: 'Planificar' }).className)
      .toContain('selected');
    expect(within(empty).getByRole('button', { name: 'Crear la primera fase' })).toBeEnabled();
  });

  it('después de crear la fase sin equipos muestra un segundo modal y navega al Resumen', async () => {
    const onNavigateToTeams = vi.fn();
    show(emptyProject(), { teamOptions: [], onNavigateToTeams });
    fireEvent.click(screen.getByRole('button', { name: 'Crear la primera fase' }));
    const phaseModal = screen.getByRole('dialog', { name: 'Nueva fase' });
    expect(within(phaseModal).getByRole('button', { name: 'Crear fase' })).toBeDisabled();
    fireEvent.change(within(phaseModal).getByRole('textbox', { name: 'Nombre de la fase' }), {
      target: { value: 'Implementación de Kora' },
    });
    fireEvent.click(within(phaseModal).getByRole('button', { name: 'Crear fase' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      projectId: 'project-1',
      input: { name: 'Implementación de Kora', initialStage: 'discovery' },
    }));
    const teamsModal = await screen.findByRole('dialog', { name: 'Primero agrega equipos' });
    expect(within(teamsModal).getByText(/El proyecto no tiene equipos asignados/))
      .toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Nuevo bloque de trabajo' })).not.toBeInTheDocument();
    fireEvent.click(within(teamsModal).getByRole('button', { name: 'Ir a Equipos asignados' }));
    expect(onNavigateToTeams).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Primero agrega equipos' })).not.toBeInTheDocument();
  });

  it('si tiene equipos asignados abre directamente el formulario de bloque tras crear la fase', async () => {
    const withTeams = { ...emptyProject(), teams: project.teams } as ProjectDetail;
    show(withTeams);
    fireEvent.click(screen.getByRole('button', { name: 'Crear la primera fase' }));
    fireEvent.change(screen.getByRole('dialog', { name: 'Nueva fase' })
      .querySelector('input')!, { target: { value: 'Desarrollo inicial' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Nueva fase' }))
      .getByRole('button', { name: 'Crear fase' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo bloque de trabajo' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Primero agrega equipos' })).not.toBeInTheDocument();
  });

  it('en solo lectura informa el estado vacío sin permitir crear fases', () => {
    show(emptyProject(), { canManage: false, teamOptions: [] });
    expect(screen.getByText(/El responsable del proyecto debe crear la primera fase/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear la primera fase' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Nueva fase' })).not.toBeInTheDocument();
  });
});

describe('Revisión de tareas desde el Roadmap del Líder PM', () => {
  const pendingTask = {
    id: 'task-review-1', name: 'Mejoras en bitácora', teamId: 'team-1',
    assigneeUserId: 'collab-1', assigneeName: 'Claudio Flores',
    segmentId: null, status: 'in_review', scope: 'desarrollo',
    description: null, startDate: '2026-10-19', date: '2026-10-30',
    estimatedHours: 24, cancelledAt: null, completedAt: null,
  };
  const reviewProject = () => ({
    ...project, modules: [{ ...module, tasks: [pendingTask] }],
  } as unknown as ProjectDetail);

  it('muestra aviso de tarea completada y permite aprobar desde el Roadmap', async () => {
    show(reviewProject());
    const queue = screen.getByRole('region', { name: 'Tareas por aprobar' });
    expect(within(queue).getByText('Tareas por aprobar (1)')).toBeInTheDocument();
    expect(within(queue).getByText('Mejoras en bitácora')).toBeInTheDocument();
    fireEvent.click(within(queue).getByRole('button', { name: 'Aprobar' }));
    const modal = screen.getByRole('dialog', { name: 'Aprobar tarea' });
    expect(within(modal).getByText('Claudio Flores')).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', taskId: 'task-review-1',
      input: { status: 'done', rejectionReason: null },
    }));
  });

  it('muestra Aprobar y Devolver en la fila y exige motivo al devolver', async () => {
    show(reviewProject());
    const row = screen.getByText('Mejoras en bitácora', { selector: 'td' }).closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Devolver' }));
    const modal = screen.getByRole('dialog', { name: 'Devolver tarea' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Devolver' }));
    expect(within(modal).getByText('Escribe el motivo del rechazo antes de continuar.'))
      .toBeInTheDocument();
    expect(mocks.updateTask).not.toHaveBeenCalled();
    fireEvent.change(within(modal).getByLabelText('Motivo del rechazo'), {
      target: { value: 'Corregir validación de fechas' },
    });
    fireEvent.click(within(modal).getByRole('button', { name: 'Devolver' }));
    await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', taskId: 'task-review-1',
      input: { status: 'in_progress', rejectionReason: 'Corregir validación de fechas' },
    }));
  });

  it('no muestra tareas canceladas ni ya aprobadas en la cola', () => {
    show({ ...project, modules: [{ ...module,
      tasks: [{ ...pendingTask, status: 'done' }, { ...pendingTask, id: 'cancelled', cancelledAt: '2026-10-31' }],
    }] } as unknown as ProjectDetail);
    expect(screen.queryByRole('region', { name: 'Tareas por aprobar' })).not.toBeInTheDocument();
  });
});

describe('Edición superpuesta sobre el detalle lateral del bloque', () => {
  it('conserva seleccionado el bloque mientras se edita y al cancelar vuelve al panel lateral', async () => {
    const segment = {
      id: 'segment-real-1', name: 'Bloque operativo',
      teamId: 'team-1', teamName: 'Desarrollo',
      startDate: '2026-11-04', endDate: '2026-11-24',
      estimatedHours: 80, consumedHours: 0, closedAt: null, members: [],
    };
    show({
      ...project,
      modules: [{ ...module, segments: [segment] }],
    } as unknown as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir segmento operativo' }));
    expect(screen.getByRole('dialog', { name: 'Bloque operativo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar bloque' }));
    const editForm = await screen.findByRole('dialog', { name: 'Editar bloque de trabajo' });
    // Deben coexistir DOS dialog nativos: edición en primer plano y
    // contexto del segmento detrás, sin reiniciar la selección.
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(2);
    expect(editForm).toBeInTheDocument();
    fireEvent.click(within(editForm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Editar bloque de trabajo' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Bloque operativo' })).toBeInTheDocument();
  });
});

describe('Cabecera de las fases · HTML v5', () => {
  it('no muestra la antigua Hoja de ruta ni el resumen duplicado de etapas', () => {
    show();
    expect(screen.queryByText(/Hoja de ruta/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Etapa actual')).not.toBeInTheDocument();
    expect(screen.queryByText('Etapa inicial')).not.toBeInTheDocument();
    // Las HH no desaparecen: siguen visibles en la cabecera de fase.
    expect(screen.getByText('Sin fechas, 120 HH de fase')).toBeInTheDocument();
  });

  it('la cabecera de fase muestra periodo, HH reales y preventa del contrato', () => {
    show({ ...project, prospectPhaseHours: 18,
      modules: [{ ...module, estimatedHours: null, segments: [{
        id: 'segment-1', teamId: 'team-1', teamName: 'Desarrollo', name: 'Diseño UX',
        startDate: '2026-09-07', endDate: '2026-10-16', estimatedHours: 464,
        members: [],
      }] }],
    } as unknown as ProjectDetail);
    expect(screen.getByText('07-09-2026 → 16-10-2026, 464 HH de bloques')).toBeInTheDocument();
    expect(screen.getByTestId('presale-hours')).toHaveTextContent('18');
  });

  it('muestra avance real y plan automático, y habilita Planificar sin afectar la vista', () => {
    show();
    expect(screen.getByText('25% real · 40% plan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Bloque de trabajo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase Diseño Backend' }))
      .toHaveValue('Diseño Backend');
    expect(inputHasInlinePlanningClass()).toBe(true);
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

  it('abre el formulario completo para un nuevo bloque con HH y entrega de cierre', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Bloque de trabajo' }));
    expect(screen.getByRole('dialog', { name: 'Nuevo bloque de trabajo' })).toBeInTheDocument();
    expect(screen.getByText(/160 HH asignadas, 0 HH ya en otros bloques/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del bloque/ }),
      { target: { value: 'Diseño UX' } });
    fireEvent.change(screen.getByLabelText(/Fecha de inicio/),
      { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText(/Fecha de fin/),
      { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /HH estimadas/ }),
      { target: { value: '60' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre de la entrega/ }),
      { target: { value: 'Diseños revisados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear bloque de trabajo' }));
    await waitFor(() => expect(mocks.createSegment).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
      input: {
        teamId: 'team-1', name: 'Diseño UX',
        startDate: '2026-11-05', endDate: '2026-11-20', estimatedHours: 60,
        members: [], closingDelivery: { name: 'Diseños revisados' },
      },
    }));
  });

  it('permite crear un bloque explícitamente sin entrega de cierre', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Bloque de trabajo' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del bloque/ }),
      { target: { value: 'Correcciones' } });
    fireEvent.change(screen.getByLabelText(/Fecha de inicio/),
      { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText(/Fecha de fin/),
      { target: { value: '2026-11-15' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /HH estimadas/ }),
      { target: { value: '24' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Este bloque no tiene entrega/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear bloque de trabajo' }));
    await waitFor(() => expect(mocks.createSegment).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
      input: {
        teamId: 'team-1', name: 'Correcciones',
        startDate: '2026-11-10', endDate: '2026-11-15', estimatedHours: 24, members: [],
      },
    }));
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

describe('Referencias de bloque de trabajo de la cotización', () => {
  const seedReference = () => {
    mocks.appliedPlan.modules = [{
      moduleId: 'module-1',
      tasks: [],
      totalHours: 160,
      relativeTeamBlocks: [{ teamId: 'team-1', hours: 160, startWeek: 3, durationWeeks: 5 }],
    }];
  };
  const plannedSegment = {
    id: 'segment-1', teamId: 'team-1', teamName: 'Desarrollo',
    name: 'Diseño Backend · Desarrollo',
    startDate: '2026-11-03', endDate: '2026-12-08', members: [],
  };

  it('muestra fechas definitivas de un segmento materializado tras Hito 0', () => {
    seedReference();
    show({ ...project, status: 'active', startDate: '2026-11-05',
      modules: [{ ...module, segments: [plannedSegment] }],
    } as unknown as ProjectDetail);
    expect(screen.getByText('03-11-2026 → 08-12-2026, 120 HH de fase · 1 bloque sin HH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planificar bloque' })).not.toBeInTheDocument();
    expect(screen.queryByText(/propuesta/i)).not.toBeInTheDocument();
  });

  it('una fase sin bloques antes de Hito 0 aún no muestra fechas operativas', () => {
    seedReference();
    show();
    expect(screen.getByText('Sin fechas, 120 HH de fase')).toBeInTheDocument();
  });

  it('quita Planificar bloque de la fila y lo conserva dentro del panel lateral', () => {
    seedReference();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    expect(screen.queryByRole('button', { name: 'Planificar bloque' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir bloque Diseño Backend · Desarrollo' }));
    const drawer = screen.getByRole('dialog', { name: 'Diseño Backend' });
    expect(within(drawer).getByRole('button', { name: 'Planificar bloque' })).toBeEnabled();
    expect(screen.queryByText('Bloque planificado')).not.toBeInTheDocument();
  });


  it('el lateral de la referencia previa al inicio no solicita otra aprobación', () => {
    seedReference();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir bloque Diseño Backend · Desarrollo' }));
    expect(screen.getByText('Sin bloque operativo')).toBeInTheDocument();
    expect(screen.getByText(/se generarán automáticamente los bloques/)).toBeInTheDocument();
    expect(screen.queryByText(/Confírmala mediante/)).not.toBeInTheDocument();
    expect(mocks.createSegment).not.toHaveBeenCalled();
  });

  it('abre el panel lateral del bloque EDT referencial al seleccionarlo', () => {
    seedReference();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir bloque Diseño Backend · Desarrollo' }));
    expect(screen.getByRole('dialog', { name: 'Diseño Backend' })).toBeInTheDocument();
    expect(screen.getByText(/se generarán automáticamente los bloques/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planificar bloque' })).toBeEnabled();
    expect(mocks.createSegment).not.toHaveBeenCalled();
  });

  it('actualiza el estado a bloque planificado cuando el segmento aparece tras el guardado', () => {
    seedReference();
    const view = show();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    expect(screen.queryByRole('button', { name: 'Planificar bloque' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir bloque Diseño Backend · Desarrollo' }));
    expect(within(screen.getByRole('dialog', { name: 'Diseño Backend' }))
      .getByRole('button', { name: 'Planificar bloque' })).toBeInTheDocument();
    view.rerender(
      <ProjectModulesCard project={{
        ...project, modules: [{ ...module, segments: [plannedSegment] }],
      } as unknown as ProjectDetail} hourEntries={[]}
      teamOptions={[{ value: 'team-1', label: 'Desarrollo' }]} canManage />,
    );
    expect(screen.queryByRole('button', { name: 'Planificar bloque' })).not.toBeInTheDocument();
    expect(screen.getByText('Tareas')).toBeInTheDocument();
  });

  it('identifica un bloque operativo del equipo sin afirmar que es la referencia si fue renombrado', () => {
    seedReference();
    show({
      ...project,
      modules: [{ ...module, segments: [{ ...plannedSegment, name: 'Trabajo de integración API' }] }],
    } as unknown as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    expect(screen.queryByText('Bloque planificado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planificar bloque' })).not.toBeInTheDocument();
  });
});


describe('Traspaso de cotización · vista operativa v5.02', () => {
  it('muestra tareas de la EDT sin colaborador y sin simular que ya están persistidas como tareas', () => {
    mocks.appliedPlan.modules = [{
      moduleId: 'module-1',
      tasks: [{ wbs: 'WBS-01', role: 'Desarrollador', name: 'Conexión con taller',
        hours: 35, teamId: 'team-1' }],
      totalHours: 35,
      relativeTeamBlocks: [{ teamId: 'team-1', hours: 35, startWeek: 1, durationWeeks: 3 }],
    }];
    show();
    expect(screen.getByText('Diseño Backend: 1 tarea espera asignación')).toBeInTheDocument();
    expect(screen.getByText(/No hay colaboradores activos de este equipo/)).toBeInTheDocument();
    expect(screen.getByText('Conexión con taller')).toBeInTheDocument();
    expect(screen.getByTitle('Referencia de cotización pendiente de crear como tarea operativa')).toBeInTheDocument();
    expect(screen.getByText('Tareas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asignar tarea' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar tarea Conexión con taller' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar tarea Conexión con taller' })).toBeEnabled();
    // Sin colaboradores activos la tarjeta morada NO ofrece una acción inviable.
    expect(screen.queryByRole('button', { name: 'Asignar tareas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar tarea Conexión con taller' }));
    expect(screen.getByRole('dialog', { name: 'Editar tarea' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.createSegment).not.toHaveBeenCalled();
  });
  it('muestra Asignar tareas solo cuando existe un colaborador activo y no bloqueado', () => {
    mocks.appliedPlan.modules = [{
      moduleId: 'module-1',
      tasks: [{ wbs: 'WBS-02', role: 'Desarrollador', name: 'Integrar API',
        hours: 12, teamId: 'team-1' }],
      totalHours: 12,
      relativeTeamBlocks: [],
    }];
    const member = {
      id: 'assignment-1', userId: 'user-1', teamId: 'team-1',
      fullName: 'Colaborador activo', userStatus: 'active', blockedAt: null,
    };
    const { rerender } = show({ ...project, members: [
      { ...member, blockedAt: '2026-11-01T00:00:00.000Z' },
    ] } as unknown as ProjectDetail);
    expect(screen.queryByRole('button', { name: 'Asignar tareas' })).not.toBeInTheDocument();
    rerender(<MemoryRouter><ProjectModulesCard
      project={{ ...project, members: [member] } as unknown as ProjectDetail}
      hourEntries={[]} teamOptions={[{ value: 'team-1', label: 'Desarrollo' }]}
      canManage /></MemoryRouter>);
    expect(screen.queryByText(/No hay colaboradores activos de este equipo/)).not.toBeInTheDocument();
    const assign = screen.getByRole('button', { name: 'Asignar tareas' });
    expect(assign).toBeEnabled();
    fireEvent.click(assign);
    expect(screen.getByRole('dialog', { name: 'Asignar tareas · Diseño Backend' })).toBeInTheDocument();
  });
});

describe('Bloque de origen en la tabla de tareas por asignar', () => {
  const quotationTasks = [{
    wbs: 'WBS-UX', role: 'Diseñador UX', name: 'Diseño de interfaz PWA y Backoffice',
    hours: 120, teamId: 'team-ux',
  }, {
    wbs: 'WBS-DEV', role: 'Desarrollador', name: 'Arquitectura de seguridad',
    hours: 40, teamId: 'team-1',
  }];
  const setup = () => {
    mocks.appliedPlan.modules = [{
      moduleId: 'module-1', totalHours: 160,
      tasks: quotationTasks,
      relativeTeamBlocks: [
        { teamId: 'team-ux', hours: 120, startWeek: 1, durationWeeks: 4 },
        { teamId: 'team-1', hours: 40, startWeek: 1, durationWeeks: 4 },
      ],
    }];
    return { ...project, teams: [
      ...project.teams,
      { teamId: 'team-ux', teamName: 'UX-UI', leader: null, memberCount: 0,
        maxMembers: null, assignedHours: 120 },
    ] };
  };

  it('muestra el bloque comercial de origen aun sin colaboradores ni tareas operativas', () => {
    const seeded = setup();
    show(seeded as unknown as ProjectDetail);
    const uxRow = screen.getByText('Diseño de interfaz PWA y Backoffice').closest('tr')!;
    const devRow = screen.getByText('Arquitectura de seguridad').closest('tr')!;
    expect(within(uxRow).getByTitle(/Bloque de origen de la estimación comercial/))
      .toHaveTextContent('Diseño Backend · UX-UI');
    expect(within(devRow).getByTitle(/Bloque de origen de la estimación comercial/))
      .toHaveTextContent('Diseño Backend · Desarrollo');
    expect(within(uxRow).getByText('Sin asignar')).toBeInTheDocument();
    expect(within(uxRow).getByText('Por asignar')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente de planificar')).not.toBeInTheDocument();
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(mocks.createSegment).not.toHaveBeenCalled();
  });

  it('conserva la etiqueta comercial aunque el bloque todavía no tenga segmentId', () => {
    const seeded = setup();
    show({
      ...seeded,
      modules: [{ ...module, tasks: [{
        id: 'task-converted', name: quotationTasks[0]!.name, teamId: 'team-ux',
        segmentId: null, assigneeUserId: null, assigneeName: null,
        status: 'todo', description:
          'Referencia cotización version-1 · WBS WBS-UX · Diseñador UX',
        estimatedHours: 120, date: null, startDate: null,
      }] }],
    } as unknown as ProjectDetail);
    const row = screen.getByText('Diseño de interfaz PWA y Backoffice').closest('tr')!;
    expect(within(row).getByTitle(/Bloque de origen de la cotización/))
      .toHaveTextContent('Diseño Backend · UX-UI');
    expect(within(row).getByText('Por asignar')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente de planificar')).not.toBeInTheDocument();
  });

  it('no atribuye un bloque a una referencia de EDT sin equipo de origen', () => {
    setup();
    mocks.appliedPlan.modules[0]!.tasks = [{
      wbs: 'WBS-00', role: 'Diseñador UX', name: 'Tarea sin equipo', hours: 8,
    }];
    show();
    const row = screen.getByText('Tarea sin equipo').closest('tr')!;
    expect(within(row).getByText('Sin bloque de origen identificado')).toBeInTheDocument();
    expect(within(row).getByText('Por asignar')).toBeInTheDocument();
  });
});

describe('Acciones reales para referencias EDT antes de convertirlas', () => {
  const seed = () => {
    mocks.appliedPlan.modules = [{
      moduleId: 'module-1', tasks: [{
        wbs: 'WBS-01', role: 'Desarrollador', name: 'Conexión con taller',
        hours: 35, teamId: 'team-1',
      }], relativeTeamBlocks: [], totalHours: 35,
    }];
  };

  it('elimina solo la fila operativa, no llama al borrado de tarea ni toca la cotización', async () => {
    seed();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar tarea Conexión con taller' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Eliminar tarea', confirmLabel: 'Eliminar tarea', cancelLabel: 'Volver',
    })));
    await waitFor(() => expect(mocks.excludeReference).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
      input: { versionId: 'version-1', wbs: 'WBS-01', role: 'Desarrollador' },
    }));
    expect(mocks.removeTask).not.toHaveBeenCalled();
    expect(mocks.appliedPlan.modules[0]!.tasks).toHaveLength(1);
  });

  it('no vuelve a mostrar una referencia descartada registrada por el backend', () => {
    seed();
    mocks.excluded = [{
      moduleId: 'module-1', versionId: 'version-1',
      wbs: 'WBS-01', role: 'Desarrollador',
    }];
    show();
    expect(screen.queryByText('Conexión con taller')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar tarea Conexión con taller' }))
      .not.toBeInTheDocument();
  });
});

describe('HH reales de las tareas y atribución explícita de bitácora', () => {
  it('muestra las HH aprobadas de la tarea y mantiene — cuando no existe vínculo', () => {
    const tasks = [
      { id: 'task-with-entries', name: 'Diseño con horas', actualHours: 6, estimatedHours: 8, pendingHours: 2 },
      { id: 'task-legacy', name: 'Tarea histórica sin vínculo', actualHours: null, estimatedHours: 12 },
    ].map((item) => ({
      ...item, status: 'done', assigneeUserId: 'user-1', assigneeName: 'Leslie',
      teamId: 'team-1', teamName: 'Desarrollo', description: null,
      startDate: '2026-10-04', date: '2026-10-25',
    }));
    show({ ...project, modules: [{ ...module, tasks }] } as unknown as ProjectDetail);
    const attributed = screen.getByText('Diseño con horas', { selector: 'td' }).closest('tr')!;
    const unlinked = screen.getByText('Tarea histórica sin vínculo', { selector: 'td' }).closest('tr')!;
    expect(within(attributed).getByText('8 / 6')).toHaveAttribute('title',
      'HH reales de bitácora aprobadas y vinculadas a esta tarea.');
    expect(within(attributed).getByText('2 HH por aprobar')).toBeInTheDocument();
    expect(within(unlinked).getByText('12 / —')).toHaveAttribute('title',
      'Sin HH aprobadas asociadas explícitamente a esta tarea.');
  });
});

describe('Homologación de estados del Roadmap v5.02', () => {
  it('reutiliza Badge y sus tonos; conserva violeta para Por asignar', () => {
    const states = [
      ['aprobada', 'done', 'success', 'user-1'],
      ['completada', 'in_review', 'warning', 'user-1'],
      ['curso', 'in_progress', 'info', 'user-1'],
      ['pendiente', 'todo', 'neutral', 'user-1'],
      ['sin-asignar', 'todo', 'unassigned', null],
    ] as const;
    const tasks = states.map(([id, status, , assigneeUserId]) => ({
      id, name: 'Estado ' + id, status,
      startDate: '2026-11-04', date: '2027-01-10', estimatedHours: 10,
      assigneeUserId, assigneeName: assigneeUserId ? 'Colaborador' : null,
      teamId: 'team-1', teamName: 'Desarrollo', description: null,
    }));
    show({ ...project, modules: [{ ...module, tasks }] } as unknown as ProjectDetail);

    for (const [id, , tone] of states) {
      const row = screen.getByText('Estado ' + id, { selector: 'td' }).closest('tr')!;
      const badge = within(row).getByText(id === 'aprobada' ? 'Aprobada' :
        id === 'completada' ? 'Completada' : id === 'curso' ? 'En curso' :
          id === 'pendiente' ? 'Pendiente' : 'Por asignar');
      expect(badge.className).toContain('badge');
      expect(badge.className).toContain(tone);
      // Punto y tipografía del Badge de Kora para TODOS los estados.
      expect(badge.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    }
  });

  it('muestra En curso + Devuelta + Vencida juntos con Badge nativo y punto', () => {
    const rejected = {
      id: 'task-returned', name: 'Corrección devuelta', status: 'in_progress',
      rejectionReason: 'Corregir la validación de fechas',
      startDate: '2026-10-01', date: '2026-10-20', estimatedHours: 20,
      assigneeUserId: 'user-1', assigneeName: 'Colaborador',
      teamId: 'team-1', teamName: 'Desarrollo', description: null,
    };
    show({ ...project, modules: [{ ...module, tasks: [rejected] }] } as unknown as ProjectDetail);
    const row = screen.getByText('Corrección devuelta', { selector: 'td' }).closest('tr')!;
    const progress = within(row).getByText('En curso');
    const returned = within(row).getByText('Devuelta');
    const overdue = within(row).getByText('Vencida');
    for (const [chip, tone] of [
      [progress, 'info'], [returned, 'warning'], [overdue, 'danger'],
    ] as const) {
      expect(chip.className).toContain('badge');
      expect(chip.className).toContain(tone);
      expect(chip.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    }
    // El tooltip del motivo está en el wrapper, no sobre el Badge.
    expect(returned.parentElement).toHaveAttribute('title', 'Corregir la validación de fechas');
    // Los tres indicadores coexisten en el mismo grupo, sin sustituirse.
    expect(progress.parentElement).toContainElement(returned);
    expect(progress.parentElement).toContainElement(overdue);
  });

  it('solo indica vencimiento en tareas abiertas, no en completadas para aprobar', () => {
    const tasks = [
      { id: 'task-open', name: 'Ajuste en curso', status: 'in_progress' },
      { id: 'task-review', name: 'Esperando aprobación', status: 'in_review' },
    ].map((entry) => ({
      ...entry, startDate: '2026-10-01', date: '2026-10-03',
      estimatedHours: 10, assigneeUserId: 'user-1', assigneeName: 'Colaborador',
      teamId: 'team-1', teamName: 'Desarrollo', description: null,
    }));
    show({ ...project, modules: [{ ...module, tasks }] } as unknown as ProjectDetail);
    const openRow = screen.getByText('Ajuste en curso').closest('tr')!;
    const reviewRow = screen.getByText('Esperando aprobación', { selector: 'td' }).closest('tr')!;
    expect(within(openRow).getByText('Vencida')).toBeInTheDocument();
    expect(within(reviewRow).getByText('Completada')).toBeInTheDocument();
    expect(within(reviewRow).queryByText('Vencida')).not.toBeInTheDocument();
  });
});

describe('Fidelidad del Roadmap v5.02 · acciones y estructura', () => {
  it('muestra Agregar fase al final sin los desplegables descartados', async () => {
    show();
    expect(screen.queryByText('Referencias comerciales y planificación manual')).not.toBeInTheDocument();
    expect(screen.queryByText('Etapa y datos de la fase')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Agregar fase' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }));
    const addPhase = screen.getByRole('button', { name: '+ Agregar fase' });
    expect(addPhase.className).toContain('tertiary');
    expect(addPhase).toHaveAttribute('type', 'button');
    fireEvent.click(addPhase);
    expect(screen.getByRole('dialog', { name: 'Nueva fase' })).toBeInTheDocument();
    expect(screen.getByText('La etapa macro del plan. Después le agregas bloques de trabajo por equipo.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Horas estimadas' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Etapa inicial')).not.toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Crear fase' });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la fase' }),
      { target: { value: 'Nueva integración' } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      projectId: 'project-1',
      input: { name: 'Nueva integración', initialStage: 'discovery' },
    }));
    await waitFor(() => expect(screen.getByRole('dialog', {
      name: 'Nuevo bloque de trabajo',
    })).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Nueva fase' })).not.toBeInTheDocument();
    expect(screen.getByText(/Fase 2: Nueva integración/)).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledWith('Fase creada. Ahora agrega su primer bloque de trabajo.');
  });

  it('deja de presentar la columna Acción y usa los iconos reales en tareas existentes', async () => {
    const task = { id: 'task-1', name: 'Diseñar interfaz', status: 'todo',
      startDate: '2026-11-04', date: '2026-11-15', estimatedHours: 20,
      assigneeUserId: null, assigneeName: null, description: null, teamId: 'team-1',
      teamName: 'Desarrollo' };
    show({ ...project, modules: [{ ...module, tasks: [task] }] } as unknown as ProjectDetail);
    expect(screen.queryByRole('columnheader', { name: 'Acción' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar tarea Diseñar interfaz' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicar tarea Diseñar interfaz' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar tarea Diseñar interfaz' }));
    expect(screen.getByRole('dialog', { name: 'Editar tarea' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Título de la tarea' }),
      { target: { value: 'Diseñar interfaz principal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', taskId: 'task-1',
      input: { name: 'Diseñar interfaz principal', description: null,
        teamId: 'team-1', segmentId: null, assigneeUserId: null, status: 'todo',
        startDate: '2026-11-04', date: '2026-11-15', estimatedHours: 20 },
    }));
  });
  it.each(['todo', 'in_progress', 'done'] as const)(
    'muestra duplicar directamente para una tarea asignada en estado %s', (status) => {
      const task = { id: 'task-1', name: 'Diseñar interfaz', status,
        startDate: '2026-11-04', date: '2026-11-15', estimatedHours: 20,
        scope: 'diseno', description: 'Diseño validado', teamId: 'team-1',
        segmentId: null, assigneeUserId: 'user-1', assigneeName: 'Persona original',
        teamName: 'Desarrollo' };
      const member = (userId: string, fullName: string) => ({
        userId, fullName, teamId: 'team-1', teamName: 'Desarrollo', userStatus: 'active',
      });
      show({ ...project, members: [member('user-1', 'Persona original'),
        member('user-2', 'Persona nueva')], modules: [{ ...module, tasks: [task] }] } as unknown as ProjectDetail);
      const duplicate = screen.getByRole('button', { name: 'Duplicar tarea Diseñar interfaz' });
      expect(duplicate).toHaveAttribute('title', 'Duplicar para otra persona');
      fireEvent.click(duplicate);
      expect(screen.getByRole('dialog', { name: 'Duplicar para otra persona' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Título de la tarea' })).toHaveValue('Diseñar interfaz (2)');
      expect(screen.getByRole('spinbutton', { name: 'HH estimadas' })).toHaveValue(20);
    },
  );

  it('confirma antes de borrar, utiliza Volver y presenta notificación al eliminar', async () => {
    const task = { id: 'task-1', name: 'Acompañamiento UAT', status: 'todo',
      startDate: '2026-11-04', date: '2026-11-15', estimatedHours: 12,
      teamId: 'team-1', assigneeUserId: null, assigneeName: null, description: null };
    show({ ...project, modules: [{ ...module, tasks: [task] }] } as unknown as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar tarea Acompañamiento UAT' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Eliminar tarea', confirmLabel: 'Eliminar tarea',
      cancelLabel: 'Volver', confirmVariant: 'secondary',
    })));
    await waitFor(() => expect(mocks.removeTask).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', taskId: 'task-1',
    }));
    expect(mocks.success).toHaveBeenCalledWith('Tarea eliminada.');
  });

  it('crea una tarea desde el pie de la tabla sin cambiar el plan comercial', async () => {
    show({
      ...project,
      modules: [{
        ...module,
        segments: [{
          id: 'segment-1', teamId: 'team-1', teamName: 'Desarrollo', name: 'Bloque operativo',
          startDate: '2026-11-01', endDate: '2026-11-30', estimatedHours: 120, members: [],
        }],
      }],
    } as unknown as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar tarea' }));
    expect(screen.getByRole('dialog', { name: 'Nueva tarea' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Título de la tarea' }),
      { target: { value: 'Revisar integración' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /HH estimadas/ }),
      { target: { value: '16' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Bloque de trabajo/ }),
      { target: { value: 'segment-1' } });
    fireEvent.change(screen.getByLabelText(/Fecha de inicio/),
      { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText(/Fecha límite/),
      { target: { value: '2026-11-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
      input: {
        name: 'Revisar integración', description: 'Bloque de trabajo: Bloque operativo · ID segment-1',
        teamId: 'team-1', segmentId: 'segment-1', assigneeUserId: null, scope: 'desarrollo',
        status: 'todo', estimatedHours: 16,
        startDate: '2026-11-05', date: '2026-11-12',
      },
    }));
  });

  it('abre el formulario para duplicar sin copiar estado ni horas consumidas', async () => {
    const task = { id: 'task-1', name: 'Diseñar interfaz', status: 'done',
      startDate: '2026-11-04', date: '2026-11-15', estimatedHours: 20,
      scope: 'diseno', description: 'Diseño validado', teamId: 'team-1',
      assigneeUserId: 'user-1', assigneeName: 'Persona original', teamName: 'Desarrollo' };
    const member = (userId: string, fullName: string) => ({
      userId, fullName, teamId: 'team-1', teamName: 'Desarrollo', userStatus: 'active',
    });
    show({ ...project, members: [member('user-1', 'Persona original'),
      member('user-2', 'Persona nueva')], modules: [{ ...module, tasks: [task] }] } as unknown as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Editar tarea Diseñar interfaz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar para otra persona' }));
    expect(screen.getByRole('dialog', { name: 'Duplicar para otra persona' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /Asignado a/ }), { target: { value: 'team-1:user-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar tarea' }));
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
      input: {
        name: 'Diseñar interfaz (2)', description: 'Diseño validado',
        teamId: 'team-1', segmentId: null, assigneeUserId: 'user-2', scope: 'diseno',
        status: 'todo', estimatedHours: 20, startDate: '2026-11-04', date: '2026-11-15',
      },
    }));
  });

});
