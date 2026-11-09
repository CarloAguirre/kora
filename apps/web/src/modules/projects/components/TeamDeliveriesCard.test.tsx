import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { TeamDeliveriesCard } from './TeamDeliveriesCard';

const mocks = vi.hoisted(() => ({ onClose: vi.fn() }));
vi.mock('./DeliveryActionDialogs', () => ({
  DeliveryActionDialogs: ({ target }: { target: { action: string } | null }) =>
    target ? <div role="dialog" aria-label={'Acción entrega: ' + target.action} /> : null,
}));

const teamId = '0777e456-fd76-445e-83f1-afc25061c101';
const otherTeamId = '0777e456-fd76-445e-83f1-afc25061c102';
const projectId = '0777e456-fd76-445e-83f1-afc25061c103';
const delivery = (status: 'planned' | 'delivered' | 'approved', canManage = true) => ({
  id: '0777e456-fd76-445e-83f1-afc25061c104',
  teamId, status, canManage, assigneeUserId: '0777e456-fd76-445e-83f1-afc25061c105',
  assigneeName: 'Integrante Desarrollo',
  name: 'Entregable de Desarrollo', rejectionReason: null,
  estimatedDate: '2026-11-15',
});
const project = (status: 'planned' | 'delivered' | 'approved' = 'planned',
  canManage = true): ProjectDetail => ({
  id: projectId, members: [],
  modules: [{
    id: '0777e456-fd76-445e-83f1-afc25061c106',
    name: 'Desarrollo',
    segments: [],
    deliveries: [
      delivery(status, canManage),
      { ...delivery('planned'), id: '0777e456-fd76-445e-83f1-afc25061c107',
        name: 'Entrega de QA', teamId: otherTeamId },
    ],
  }],
} as unknown as ProjectDetail);
beforeEach(() => mocks.onClose.mockClear());

describe('Entregas del equipo y preparación por líder', () => {
  it('el líder puede marcar lista una entrega del equipo y nunca la aprueba automáticamente', () => {
    render(<TeamDeliveriesCard project={project()} projectId={projectId} teamId={teamId} />);
    expect(screen.getByText('Entregable de Desarrollo')).toBeInTheDocument();
    expect(screen.queryByText('Entrega de QA')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lista' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: complete' })).toBeInTheDocument();
  });
  it('la vista de gestión marca lista para aprobación, y ofrece aprobar solo después', () => {
    const view = render(<TeamDeliveriesCard project={project()} projectId={projectId}
      teamId={teamId} managerView />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lista' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: complete' })).toBeInTheDocument();
    view.unmount();
    render(<TeamDeliveriesCard project={project('delivered')} projectId={projectId}
      teamId={teamId} managerView />);
    expect(screen.queryByRole('button', { name: 'Marcar como lista' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar entrega' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: approve' })).toBeInTheDocument();
  });
  it('sin permisos de gestión no permite marcar lista ni aprobar', () => {
    render(<TeamDeliveriesCard project={project('planned', false)}
      projectId={projectId} teamId={teamId} />);
    expect(screen.queryByRole('button', { name: 'Marcar como lista' })).not.toBeInTheDocument();
  });
});
