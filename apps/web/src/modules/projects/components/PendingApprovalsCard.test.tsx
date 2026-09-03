import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProjectPendingApprovalsResponse } from '@kora/contracts';
import { PendingApprovalsCard } from './PendingApprovalsCard';

const useProjectPendingApprovals = vi.fn();

vi.mock('@/modules/hours/api/hours.queries', () => ({
  useProjectPendingApprovals: (...args: unknown[]) => useProjectPendingApprovals(...args),
}));

function mockData(response: ProjectPendingApprovalsResponse | undefined) {
  useProjectPendingApprovals.mockReturnValue({ data: response });
}

describe('PendingApprovalsCard', () => {
  it('no renderiza nada para quien no es líder del proyecto (ni admin/pmo)', () => {
    mockData({ groups: [] });
    const { container } = render(<PendingApprovalsCard projectId="project-1" visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza nada mientras no hay datos', () => {
    mockData(undefined);
    const { container } = render(<PendingApprovalsCard projectId="project-1" visible={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa cuando no hay nada pendiente con líderes de equipo', () => {
    mockData({ groups: [] });
    render(<PendingApprovalsCard projectId="project-1" visible={true} />);
    expect(screen.getByText(/No hay horas pendientes con líderes de equipo/)).toBeInTheDocument();
  });

  it('muestra con quién está pendiente cada grupo', () => {
    mockData({
      groups: [
        {
          approverUserId: 'leader-1',
          approverName: 'Natalia Jaña',
          entryCount: 2,
          totalHours: 14,
          oldestPendingDate: '2026-08-05',
          collaborators: [
            { userId: 'user-1', userName: 'Beto', entryCount: 2, totalHours: 14, oldestPendingDate: '2026-08-05' },
          ],
        },
      ],
    });
    render(<PendingApprovalsCard projectId="project-1" visible={true} />);

    expect(screen.getByText('Natalia Jaña')).toBeInTheDocument();
    expect(screen.getByText(/2 registros/)).toBeInTheDocument();
    expect(screen.getByText(/14 HH · pendiente/)).toBeInTheDocument();
  });

  it('desglosa de qué colaborador es lo pendiente dentro de cada grupo', () => {
    mockData({
      groups: [
        {
          approverUserId: 'leader-1',
          approverName: 'Natalia Jaña',
          entryCount: 3,
          totalHours: 9,
          oldestPendingDate: '2026-08-02',
          collaborators: [
            { userId: 'user-1', userName: 'Beto', entryCount: 2, totalHours: 6, oldestPendingDate: '2026-08-02' },
            { userId: 'user-2', userName: 'Ana', entryCount: 1, totalHours: 3, oldestPendingDate: '2026-08-10' },
          ],
        },
      ],
    });
    render(<PendingApprovalsCard projectId="project-1" visible={true} />);

    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/6 HH \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/3 HH \(1\)/)).toBeInTheDocument();
  });
});
