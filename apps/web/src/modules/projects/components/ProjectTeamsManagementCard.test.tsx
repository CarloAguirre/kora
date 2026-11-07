import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { ProjectTeamsManagementCard } from './ProjectTeamsManagementCard';

const { update } = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../api/projects.queries', () => ({
  useUpdateProject: () => ({ mutateAsync: update, isPending: false }),
}));
vi.mock('@/modules/users/api/users.queries', () => ({
  useUsersList: () => ({ data: { items: [
    { id: 'leader-1', fullName: 'Líder Proyecto' },
  ] } }),
}));

const teamId = 'aa9d6d9c-f012-4cf5-8cda-7226105d5bda';
const otherId = '75b8c966-0960-4300-84b7-e844a7b70880';
const catalog = [
  { id: teamId, name: 'Desarrollo', leader: { id: 'leader-1', fullName: 'Líder Proyecto' } },
  { id: otherId, name: 'QA', leader: null },
];
const project = (withBlock: boolean): ProjectDetail => ({
  id: 'project-id', slug: 'ejemplo', soldHours: 500,
  teams: [{
    id: 'assignment-1', teamId, teamSlug: 'desarrollo', teamName: 'Desarrollo',
    leader: { id: 'leader-1', fullName: 'Líder Proyecto' },
    assignedHours: 300, memberCount: 0, maxMembers: 2,
  }],
  members: [],
  modules: [{
    id: 'module-1', name: 'Fase Desarrollo',
    segments: withBlock ? [{ id: 'block-1', name: 'Bloque desarrollo',
      teamId, startDate: '2026-11-05', endDate: '2026-12-09', estimatedHours: 300 }] : [],
  }],
} as unknown as ProjectDetail);

function mount(withBlock: boolean) {
  return render(<MemoryRouter><ToastProvider>
    <ProjectTeamsManagementCard project={project(withBlock)} catalog={catalog} />
  </ToastProvider></MemoryRouter>);
}

describe('Equipos del PM/PMO', () => {
  beforeEach(() => update.mockClear());

  it('resumen y enlace al detalle del equipo ya existente', () => {
    mount(true);
    expect(screen.getByText('HH vendidas')).toBeInTheDocument();
    expect(screen.getByText('Asignadas a equipos')).toBeInTheDocument();
    expect(screen.getByText('Planificadas en bloques')).toBeInTheDocument();
    expect(screen.getByText('Equipo Desarrollo').closest('a')).toHaveAttribute(
      'href', '/proyectos/ejemplo/equipos/desarrollo');
  });

  it('bloquea el borrado de un equipo que tiene bloques del Roadmap', () => {
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar equipo Desarrollo' }));
    expect(screen.getByText('No se puede quitar el equipo')).toBeInTheDocument();
    expect(screen.getByText(/tiene 1 bloque de trabajo en el Roadmap/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('permite quitar un equipo sin bloques y persiste el array completo', async () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar equipo Desarrollo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar equipo' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      projectId: 'project-id', input: { teams: [] },
    }));
  });

  it('agrega equipos conservando los existentes', async () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    fireEvent.change(screen.getByLabelText('Agregar equipo'), { target: { value: otherId } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      projectId: 'project-id', input: { teams: [
        { teamId, leaderUserId: 'leader-1', memberCount: 2, assignedHours: 300 },
        { teamId: otherId, leaderUserId: null, memberCount: 1, assignedHours: 0 },
      ] },
    }));
  });
});
