import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProjectModuleDelivery, ProjectModuleTask } from '@kora/contracts';
import { BlockDeliveryFinalizeDialog } from './BlockDeliveryFinalizeDialog';
import type { DeliveryActionTarget } from './DeliveryActionDialogs';

const mocks = vi.hoisted(() => ({
  updateDelivery: vi.fn(),
  updateTask: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  onClose: vi.fn(),
}));
vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ open, title, footer, children }: {
    open: boolean; title: string; footer?: ReactNode; children: ReactNode;
  }) => open ? <section role="dialog" aria-label={title}>
    <h2>{title}</h2>{children}{footer && <footer>{footer}</footer>}
  </section> : null,
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('../api/projects.queries', () => ({
  useUpdateProjectModuleDelivery: () => ({
    mutateAsync: mocks.updateDelivery, isPending: false,
  }),
  useUpdateProjectModuleTask: () => ({
    mutateAsync: mocks.updateTask, isPending: false,
  }),
}));

const projectId = 'project-1';
const moduleId = 'module-1';
const tasks = [
  {
    id: 'task-complete', name: 'Mejoras en bitácora', teamId: 'team-1',
    assigneeUserId: 'user-1', assigneeName: 'Claudio Flores',
    status: 'in_review', startDate: '2026-10-20', date: '2026-10-30',
    cancelledAt: null, rejectionReason: null,
  },
  {
    id: 'task-in-progress', name: 'Ajustes en vista de proyectos', teamId: 'team-1',
    assigneeUserId: 'user-2', assigneeName: 'Carlo Aguirre',
    status: 'in_progress', startDate: '2026-10-26', date: '2026-11-06',
    cancelledAt: null, rejectionReason: null,
  },
  {
    id: 'task-overdue', name: 'Corrección de errores reportados', teamId: 'team-1',
    assigneeUserId: 'user-1', assigneeName: 'Claudio Flores',
    status: 'in_progress', startDate: '2026-10-22', date: '2026-10-28',
    cancelledAt: null, rejectionReason: null,
  },
] as ProjectModuleTask[];
const delivery = {
  id: 'delivery-1', name: 'Correcciones y mejoras',
  segmentId: 'segment-1', segmentName: 'Mejoras y correcciones',
  status: 'planned', estimatedDate: '2026-11-13', canManage: true,
} as ProjectModuleDelivery;
const target = (blockTasks: ProjectModuleTask[] = tasks): DeliveryActionTarget => ({
  action: 'finalize', moduleId, moduleName: 'Mejoras y correcciones',
  blockName: 'Mejoras y correcciones',
  blockStartDate: '2026-10-01', blockTasks, delivery,
});
const show = (chosen: DeliveryActionTarget = target()) => render(
  <BlockDeliveryFinalizeDialog projectId={projectId} target={chosen} onClose={mocks.onClose} />,
);

beforeEach(() => {
  mocks.updateDelivery.mockReset().mockResolvedValue(undefined);
  mocks.updateTask.mockReset().mockResolvedValue(undefined);
  mocks.success.mockReset();
  mocks.error.mockReset();
  mocks.onClose.mockReset();
});

describe('Cierre de bloque por el líder de equipo', () => {
  it('avisa tareas inconsistentes y aprueba solo la completada, sin cerrar automáticamente', async () => {
    show();
    const warning = screen.getByRole('dialog', { name: 'Aún no se puede marcar la entrega' });
    expect(within(warning).getByText(/Quedan 3 tareas sin terminar/)).toBeInTheDocument();
    expect(within(warning).getByText('Mejoras en bitácora')).toBeInTheDocument();
    expect(within(warning).getByText('Ajustes en vista de proyectos')).toBeInTheDocument();
    expect(within(warning).getByText('Corrección de errores reportados')).toBeInTheDocument();
    fireEvent.click(within(warning).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId, moduleId, taskId: 'task-complete',
      input: { status: 'done', rejectionReason: null },
    }));
    expect(mocks.success).toHaveBeenCalledWith('Tarea aprobada.');
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
  });

  it('tras aprobar, el enlace rojo abre confirmación y cancela solo pendientes en el backend', async () => {
    const view = show();
    const approved = { ...tasks[0]!, status: 'done' as const };
    view.rerender(<BlockDeliveryFinalizeDialog projectId={projectId}
      target={target([approved, tasks[1]!, tasks[2]!])} onClose={mocks.onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregada de todas maneras' }));
    const confirm = screen.getByRole('dialog', { name: 'Marcar como entregada' });
    expect(within(confirm).getByText('Estas 2 tareas se cancelarán')).toBeInTheDocument();
    expect(within(confirm).getByText(/Las horas registradas se mantienen en la bitácora/))
      .toBeInTheDocument();
    expect(within(confirm).queryByText('Mejoras en bitácora')).not.toBeInTheDocument();
    fireEvent.change(within(confirm).getByLabelText('Comentario o link de evidencia'), {
      target: { value: 'Acta de cierre del líder' },
    });
    fireEvent.click(within(confirm).getByRole('button', {
      name: 'Cancelar 2 tareas y marcar como entregada',
    }));
    await waitFor(() => expect(mocks.updateDelivery).toHaveBeenCalledWith({
      projectId, moduleId, deliveryId: delivery.id,
      input: expect.objectContaining({
        finalizeBlock: true, forceCancelIncompleteTasks: true,
        comment: 'Acta de cierre del líder',
      }),
    }));
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining(
      'Las 2 tareas pendientes se cancelaron',
    ));
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it('si todas las tareas están aprobadas usa cierre normal, sin cancelaciones', async () => {
    show(target([{
      ...tasks[0]!, status: 'done',
    }]));
    const dialog = screen.getByRole('dialog', { name: 'Marcar como entregada' });
    expect(within(dialog).getByLabelText('Fecha de entrega')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Comentario o link de evidencia')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /de todas maneras/i })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como entregada' }));
    await waitFor(() => expect(mocks.updateDelivery).toHaveBeenCalledWith({
      projectId, moduleId, deliveryId: delivery.id,
      input: expect.objectContaining({ finalizeBlock: true }),
    }));
    expect(mocks.updateDelivery.mock.calls[0]![0].input.forceCancelIncompleteTasks).toBeUndefined();
    expect(mocks.success).toHaveBeenCalledWith(
      'Entrega registrada. El bloque quedó cerrado y con 100 % de avance.',
    );
  });

  it('un bloque sin tareas no puede cerrarse ni usar la excepción', () => {
    show(target([]));
    expect(screen.getByText(/no tiene tareas operativas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como entregada de todas maneras' }))
      .not.toBeInTheDocument();
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
  });

  it('si falla el cierre excepcional conserva el diálogo y no muestra éxito', async () => {
    mocks.updateDelivery.mockRejectedValue(new Error('Falló el cierre'));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregada de todas maneras' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Cancelar 3 tareas y marcar como entregada',
    }));
    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent('No se pudo cerrar el bloque');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.onClose).not.toHaveBeenCalled();
  });
});
