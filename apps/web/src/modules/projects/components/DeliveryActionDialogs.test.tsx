import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectModuleDelivery } from '@kora/contracts';
import { DeliveryActionDialogs, type DeliveryActionTarget } from './DeliveryActionDialogs';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), success: vi.fn(), error: vi.fn(), onClose: vi.fn(),
}));

vi.mock('../api/projects.queries', () => ({
  useUpdateProjectModuleDelivery: () => ({ mutateAsync: mocks.update, isPending: false }),
  useUpdateProjectModuleTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('./ReviewActionModal', () => ({
  ReviewActionModal: ({ open, title, onConfirm }: {
    open: boolean; title: string; onConfirm: () => void;
  }) => open ? <div role="dialog" aria-label={title}>
    <button type="button" onClick={onConfirm}>Confirmar</button>
  </div> : null,
}));
vi.mock('./AssignCollaboratorModal', () => ({
  AssignCollaboratorModal: () => null,
}));
vi.mock('./BlockDeliveryFinalizeDialog', () => ({
  BlockDeliveryFinalizeDialog: () => null,
}));

const delivery = {
  id: 'delivery-1', segmentId: 'segment-1',
  name: 'Cierre del bloque', status: 'approved',
  estimatedDate: '2026-11-01', assigneeUserId: null, assigneeName: null,
} as ProjectModuleDelivery;
const target = (action: 'reopen' | 'revert'): DeliveryActionTarget => ({
  action, delivery, moduleId: 'module-1', moduleName: 'Diseño',
});
const show = (action: 'reopen' | 'revert') => render(
  <DeliveryActionDialogs projectId="project-1" members={[]} target={target(action)}
    onClose={mocks.onClose} />,
);

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.success.mockReset();
  mocks.error.mockReset();
  mocks.onClose.mockReset();
});

describe('Revertir entrega desde la vista del líder', () => {
  it('reabre un bloque finalizado y notifica éxito, sin restaurar tareas', async () => {
    show('reopen');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', deliveryId: 'delivery-1',
      input: { reopenBlock: true },
    }));
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Entrega revertida'));
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it('entrega independiente utiliza reversión de aprobación, no reapertura de bloque', async () => {
    show('revert');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', deliveryId: 'delivery-1',
      input: { status: 'delivered', rejectionReason: null },
    }));
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('revirtió la aprobación'));
  });
});
