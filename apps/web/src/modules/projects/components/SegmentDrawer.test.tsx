import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  ProjectDetail, ProjectModule, ProjectModuleSegment,
  ProjectModuleDelivery, ProjectModuleTask,
} from '@kora/contracts';
import { SegmentDrawer, type SegmentDrawerProps } from './SegmentDrawer';

const mocks = vi.hoisted(() => ({
  updateDelivery: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../api/projects.queries', () => ({
  useUpdateProjectModuleDelivery: () => ({ mutateAsync: mocks.updateDelivery, isPending: false }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ children, title, eyebrow, footer, side, compactSide }: {
    children: ReactNode; title: string; eyebrow?: string; footer?: ReactNode;
    side?: boolean; compactSide?: boolean;
  }) => <aside role="dialog" aria-label={title}
    data-layout={side && compactSide ? 'compact-side' : 'other'}>
    <header><span>{eyebrow}</span><h2>{title}</h2></header>
    {children}
    {footer && <footer>{footer}</footer>}
  </aside>,
}));

const segment = {
  id: 'segment-1', teamId: 'team-rpa', teamName: 'RPA',
  name: 'Bot de conciliación', startDate: '2026-09-07', endDate: '2026-10-16',
  estimatedHours: 360, consumedHours: 0, members: [],
  closedAt: '2026-10-16T18:00:00.000Z',
} as ProjectModuleSegment;
const task = (name: string, status: ProjectModuleTask['status'] = 'done') => ({
  id: name, teamId: segment.teamId, teamName: 'RPA',
  name, segmentId: segment.id, segmentName: segment.name,
  assigneeUserId: 'user-1', assigneeName: 'José Aponte',
  status, estimatedHours: 40, startDate: segment.startDate, date: segment.endDate,
  description: null, scope: 'desarrollo', completedAt: null, cancelledAt: null,
  rejectionReason: null,
}) as ProjectModuleTask;
const delivery = (status: ProjectModuleDelivery['status']) => ({
  id: 'delivery-1', name: 'Bot de conciliación · RPA',
  segmentId: segment.id, segmentName: segment.name,
  teamId: segment.teamId, teamName: segment.teamName,
  estimatedDate: '2026-10-16', status,
  assigneeUserId: 'user-1', assigneeName: 'Ana María Soto',
  canManage: true, rejectionReason: null,
  createdAt: '2026-09-07T12:00:00.000Z',
}) as ProjectModuleDelivery;
const moduleBase = {
  id: 'module-1', name: 'Bot de conciliación',
  segments: [segment], tasks: [task('Diseño del bot'), task('Desarrollo del bot')],
  deliveries: [delivery('approved')],
} as ProjectModule;
const project = {
  id: 'project-1', modules: [moduleBase],
  teams: [{
    teamId: segment.teamId, teamName: 'RPA',
    leader: { fullName: 'José Aponte' },
  }],
} as unknown as ProjectDetail;

const progress = {
  id: segment.id, name: segment.name, estimatedHours: 360,
  actualHours: 360, expectedHours: 360, consumedHours: 0,
  actualPercent: 100, expectedPercent: 100,
  coveragePercent: 22, isClosed: true,
  pendingApprovalCount: 0, overdueCount: 0, unassignedCount: 0,
};

function show(overrides: {
  segment?: ProjectModuleSegment;
  deliveries?: ProjectModuleDelivery[];
  tasks?: ProjectModuleTask[];
  onAddTask?: () => void;
  onDeleteTask?: (task: ProjectModuleTask) => void;
  onChangeClosure?: SegmentDrawerProps['onChangeClosure'];
  actualPercent?: number;
  readOnly?: boolean;
} = {}) {
  const chosenSegment = overrides.segment ?? segment;
  const module = {
    ...moduleBase,
    segments: [chosenSegment],
    deliveries: overrides.deliveries ?? [delivery('approved')],
    tasks: overrides.tasks ?? moduleBase.tasks,
  };
  const props: SegmentDrawerProps = {
    project: { ...project, modules: [module] },
    module, segment: chosenSegment, blockProgress: {
      ...progress, actualPercent: overrides.actualPercent ?? 100,
    },
    onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), readOnly: overrides.readOnly,
    onAddTask: overrides.onAddTask, onDeleteTask: overrides.onDeleteTask,
    onChangeClosure: overrides.onChangeClosure,
    onEditTask: vi.fn(), onDuplicateTask: vi.fn(),
  };
  return { ...render(<SegmentDrawer {...props} />), props };
}

beforeEach(() => {
  mocks.updateDelivery.mockReset().mockResolvedValue(undefined);
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe('Bloque operativo: fidelidad de los tres estados v5.02', () => {
  it('entrega aprobada: panel compacto, estado cerrado, entrega verde y tareas aprobadas', () => {
    show({ onChangeClosure: vi.fn() });
    const dialog = screen.getByRole('dialog', { name: 'Bot de conciliación' });
    expect(dialog).toHaveAttribute('data-layout', 'compact-side');
    expect(within(dialog).getByText('Fase 1: Bot de conciliación')).toBeInTheDocument();
    expect(within(dialog).getByText('Líder: José Aponte')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Estado: Cerrado')).toBeInTheDocument();
    expect(within(dialog).getByText('07-09 — 16-10')).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar', { name: 'Avance real del bloque' }))
      .toHaveAttribute('aria-valuenow', '100');
    expect(within(dialog).getByText(/Cerrado por entrega/)).toBeInTheDocument();
    expect(within(dialog).getByText('Entrega aprobada')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Tareas (2)' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Aprobada')).toHaveLength(2);
    const reopen = within(dialog).getByRole('button', { name: 'Reabrir bloque' });
    expect(reopen).toBeEnabled();
    expect(reopen.className).toContain('reopenButton');
    expect(within(dialog).getByRole('button', { name: 'Eliminar bloque' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Editar bloque' })).toBeEnabled();
  });

  it('usa los colores semánticos y Por asignar también dentro del panel lateral', () => {
    show({
      tasks: [
        task('Tarea aprobada', 'done'),
        task('Tarea completada', 'in_review'),
        task('Tarea en curso', 'in_progress'),
        task('Tarea pendiente', 'todo'),
        { ...task('Tarea no asignada', 'todo'), assigneeUserId: null } as ProjectModuleTask,
      ],
    });
    const dialog = screen.getByRole('dialog', { name: 'Bot de conciliación' });
    for (const [name, tone] of [
      ['Aprobada', 'success'], ['Completada', 'warning'], ['En curso', 'info'],
      ['Pendiente', 'neutral'], ['Por asignar', 'unassigned'],
    ] as const) {
      const chip = within(dialog).getByText(name);
      expect(chip.className).toContain('badge');
      expect(chip.className).toContain(tone);
    }
    expect(within(dialog).getByText('Aprobada').querySelector('span'))
      .toHaveAttribute('aria-hidden', 'true');
  });

  it('muestra En curso, Devuelta y Vencida juntos con punto de color, y conserva el motivo', () => {
    show({ tasks: [{
      ...task('Corrección devuelta', 'in_progress'),
      rejectionReason: 'Corregir integración de fechas',
      date: '2026-10-10',
    }] });
    const dialog = screen.getByRole('dialog', { name: 'Bot de conciliación' });
    for (const [name, tone] of [
      ['En curso', 'info'], ['Devuelta', 'warning'], ['Vencida', 'danger'],
    ] as const) {
      const chip = within(dialog).getByText(name);
      expect(chip.className).toContain('badge');
      expect(chip.className).toContain(tone);
    }
    expect(within(dialog).getByText('Devuelta').parentElement)
      .toHaveAttribute('title', 'Corregir integración de fechas');
  });

  it('muestra HH reales de bitácora por tarea sin inventar datos históricos', () => {
    show({ tasks: [
      { ...task('Diseño del bot'), actualHours: 6 },
      { ...task('Desarrollo del bot'), actualHours: null },
    ] });
    const dialog = screen.getByRole('dialog', { name: 'Bot de conciliación' });
    expect(within(dialog).getByText(/40 HH est.\s*\/ 6 HH reales/)).toBeInTheDocument();
    expect(within(dialog).getByText(/40 HH est.\s*\/ — HH reales/)).toBeInTheDocument();
  });

  it('muestra HH de tareas aprobadas, no las HH consumidas, bajo el avance', () => {
    const withProgress = { ...segment, consumedHours: 88 } as ProjectModuleSegment;
    show({ segment: withProgress, deliveries: [delivery('planned')],
      tasks: [task('Tarea aprobada'), { ...task('Tarea sin aprobar'), status: 'in_progress' }] });
    const progressRegion = screen.getByRole('region', { name: 'Avance del bloque' });
    expect(within(progressRegion).getByText('40 HH en tareas aprobadas.')).toBeInTheDocument();
    expect(within(progressRegion).queryByText(/HH consumidas atribuidas/)).not.toBeInTheDocument();
  });

  it('entrega vencida: mantiene estado rojo aun con avance de tareas en 100%', async () => {
    const onAddTask = vi.fn();
    const onDeleteTask = vi.fn();
    // Un cierre automático por tareas aprobadas NO salda la entrega pendiente.
    const overdue = { ...segment } as ProjectModuleSegment;
    const { props } = show({
      segment: overdue, deliveries: [delivery('planned')],
      onAddTask, onDeleteTask, onChangeClosure: vi.fn(),
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Estado: Entrega vencida')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Reabrir bloque' }))
      .not.toBeInTheDocument();
    expect(within(dialog).getByText('Fecha planificada: 16-10-2026 (vencida)'))
      .toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar', { name: 'Avance real del bloque' }))
      .toHaveAttribute('aria-valuenow', '100');
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Agregar tarea' }));
    expect(onAddTask).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar tarea Diseño del bot' }));
    expect(onDeleteTask).toHaveBeenCalledWith(expect.objectContaining({ name: 'Diseño del bot' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como entregado' }));
    const completion = screen.getByRole('dialog', { name: 'Marcar como entregada' });
    expect(screen.getByRole('dialog', { name: 'Bot de conciliación' })).toBeInTheDocument();
    fireEvent.change(within(completion).getByLabelText(/Fecha de entrega/), {
      target: { value: '2026-10-30' },
    });
    fireEvent.change(within(completion).getByLabelText('Comentario o link de evidencia'), {
      target: { value: 'Ejecución QA verificada' },
    });
    fireEvent.click(within(completion).getByRole('button', { name: 'Marcar como entregada' }));
    await waitFor(() => expect(mocks.updateDelivery).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', deliveryId: 'delivery-1',
      input: { finalizeBlock: true, completedOn: '2026-10-30',
        comment: 'Ejecución QA verificada' },
    }));
    expect(props.onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Marcar como entregada' }))
      .not.toBeInTheDocument());
    expect(mocks.success).toHaveBeenCalled();
  });

  it('permite confirmar la entrega con fecha y sin comentario obligatorio', async () => {
    show({ deliveries: [delivery('planned')], onChangeClosure: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregado' }));
    const form = screen.getByRole('dialog', { name: 'Marcar como entregada' });
    fireEvent.change(within(form).getByLabelText(/Fecha de entrega/), {
      target: { value: '2026-10-16' },
    });
    expect(within(form).getByRole('button', { name: 'Marcar como entregada' })).toBeEnabled();
    fireEvent.click(within(form).getByRole('button', { name: 'Marcar como entregada' }));
    await waitFor(() => expect(mocks.updateDelivery).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', deliveryId: 'delivery-1',
      input: { finalizeBlock: true, completedOn: '2026-10-16' },
    }));
  });

  it('reabrir una entrega finalizada usa la transición específica y deja registro', async () => {
    show({ deliveries: [{
      ...delivery('approved'), completedOn: '2026-10-30',
    } as ProjectModuleDelivery], onChangeClosure: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir bloque' }));
    await waitFor(() => expect(mocks.updateDelivery).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', deliveryId: 'delivery-1',
      input: { reopenBlock: true },
    }));
  });

  it('cierre sin entrega: explica el cierre registrado sin inventar autor', () => {
    const onChangeClosure = vi.fn();
    show({ deliveries: [], onChangeClosure });
    expect(screen.getByLabelText('Estado: Cerrado')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cierre del bloque' }))
      .toHaveTextContent('Su cierre quedó registrado el 16-10-2026');
    expect(screen.queryByText('Entrega aprobada')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como entregado' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir bloque' }));
    expect(onChangeClosure).toHaveBeenCalledOnce();
    expect(onChangeClosure).toHaveBeenCalledWith('reopen');
  });

  it('reemplaza Colaboradores / Forecast por Cerrar bloque deshabilitado mientras hay tareas pendientes', () => {
    const onChangeClosure = vi.fn();
    show({
      segment: { ...segment, closedAt: null } as ProjectModuleSegment,
      deliveries: [], tasks: [task('Diseñar interfaz', 'todo')],
      onChangeClosure,
    });
    expect(screen.queryByText('Colaboradores / Forecast')).not.toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Cerrar bloque' });
    expect(close).toBeDisabled();
    expect(close.parentElement).toHaveAttribute('title',
      'Se habilita cuando todas las tareas estén aprobadas.');
    expect(screen.queryByText('Se habilita cuando todas las tareas estén aprobadas.'))
      .not.toBeInTheDocument();
    fireEvent.click(close);
    expect(onChangeClosure).not.toHaveBeenCalled();
  });

  it('habilita el cierre manual cuando no hay entrega y todas las tareas están aprobadas', () => {
    const onChangeClosure = vi.fn();
    show({
      segment: { ...segment, closedAt: null } as ProjectModuleSegment,
      deliveries: [], tasks: [task('Diseñar interfaz'), task('Validar integración')],
      onChangeClosure,
    });
    const close = screen.getByRole('button', { name: 'Cerrar bloque' });
    expect(close).toBeEnabled();
    fireEvent.click(close);
    expect(onChangeClosure).toHaveBeenCalledOnce();
    expect(onChangeClosure).toHaveBeenCalledWith('close');
  });

  it('no habilita cierre manual si existe entrega: debe presentarse y aprobarse', () => {
    const onChangeClosure = vi.fn();
    show({
      segment: { ...segment, closedAt: null } as ProjectModuleSegment,
      deliveries: [delivery('planned')], tasks: [task('Revisar entrega')],
      onChangeClosure,
    });
    expect(screen.queryByRole('button', { name: 'Cerrar bloque' })).not.toBeInTheDocument();
    const deliver = screen.getByRole('button', { name: 'Marcar como entregado' });
    expect(deliver).toBeEnabled();
    expect(onChangeClosure).not.toHaveBeenCalled();
  });

  it('no permite cerrar un bloque sin tareas ni entrega', () => {
    show({
      segment: { ...segment, closedAt: null } as ProjectModuleSegment,
      deliveries: [], tasks: [], onChangeClosure: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Cerrar bloque' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar bloque' }).parentElement)
      .toHaveAttribute('title', 'Agrega tareas al bloque y apruébalas antes de cerrarlo.');
  });

  it('no habilita Marcar como entregado mientras una tarea siga pendiente', () => {
    show({
      segment: { ...segment, closedAt: null } as ProjectModuleSegment,
      deliveries: [delivery('planned')],
      tasks: [task('Diseñar UX', 'todo')], onChangeClosure: vi.fn(),
    });
    const action = screen.getByRole('button', { name: 'Marcar como entregado' });
    expect(action).toBeDisabled();
    expect(action.parentElement).toHaveAttribute('title',
      'Se habilita cuando todas las tareas estén aprobadas.');
    expect(screen.queryByText('Se habilita cuando todas las tareas estén aprobadas.'))
      .not.toBeInTheDocument();
  });

  it('muestra la fecha real, el responsable y la evidencia persistidos del cierre', () => {
    const completed = {
      ...delivery('approved'), completedOn: '2026-10-30',
      completedByName: 'Mangel Tort', completionComment: 'Acta de conformidad',
    } as ProjectModuleDelivery;
    show({ deliveries: [completed], onChangeClosure: vi.fn() });
    expect(screen.getByLabelText('Estado: Cerrado')).toBeInTheDocument();
    expect(screen.getByText(/Entregada el 30-10-2026 por Mangel Tort, con atraso/))
      .toBeInTheDocument();
    expect(screen.getByText('«Acta de conformidad»')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir bloque' })).toBeEnabled();
  });

  it('una entrega presentada espera aprobación; no se declara cerrada por entrega', () => {
    show({
      segment: { ...segment, closedAt: null } as ProjectModuleSegment,
      deliveries: [delivery('delivered')],
      actualPercent: 60,
    });
    expect(screen.getByLabelText('Estado: Entregada')).toBeInTheDocument();
    expect(screen.getByText(/Entrega presentada; pendiente de aprobación/)).toBeInTheDocument();
    expect(screen.queryByText(/Cerrado por entrega/)).not.toBeInTheDocument();
  });
});

describe('SegmentDrawer compartido en modo de solo lectura', () => {
  it('conserva panel lateral, avance, entrega y tareas sin gestionar nada aunque reciba callbacks', () => {
    show({ readOnly: true, onChangeClosure: vi.fn(), onAddTask: vi.fn(),
      onDeleteTask: vi.fn() });
    const drawer = screen.getByRole('dialog', { name: 'Bot de conciliación' });
    expect(drawer).toHaveAttribute('data-layout', 'compact-side');
    expect(within(drawer).getByText('Líder: José Aponte')).toBeInTheDocument();
    expect(within(drawer).getByRole('progressbar', { name: 'Avance real del bloque' }))
      .toHaveAttribute('aria-valuenow', '100');
    expect(within(drawer).getByRole('heading', { name: 'Tareas (2)' })).toBeInTheDocument();
    for (const action of ['Editar bloque', 'Eliminar bloque', 'Reabrir bloque',
      'Cerrar bloque', '+ Agregar tarea', 'Editar tarea Diseño del bot',
      'Duplicar tarea Diseño del bot', 'Eliminar tarea Diseño del bot']) {
      expect(within(drawer).queryByRole('button', { name: action })).not.toBeInTheDocument();
    }
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
  });
});
