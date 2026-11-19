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

function mount(withBlock: boolean, detail: ProjectDetail = project(withBlock)) {
  return render(<MemoryRouter><ToastProvider>
    <ProjectTeamsManagementCard project={detail} catalog={catalog} />
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
  it('permite asignar hasta el límite vendido sin pedir confirmación', async () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    const input = screen.getByLabelText('Horas asignadas');
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.blur(input);
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      projectId: 'project-id',
      input: { teams: [{ teamId, leaderUserId: 'leader-1', memberCount: 2, assignedHours: 500 }] },
    }));
    expect(screen.queryByText(/Se superan las HH vendidas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sí, continuar' })).not.toBeInTheDocument();
  });

  it('exige dos confirmaciones ANTES de persistir y pinta el excedente en rojo', async () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    const input = screen.getByLabelText('Horas asignadas');
    fireEvent.change(input, { target: { value: '520' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Se superan las HH vendidas por 20 HH');
    expect(screen.getByText('Asignadas a equipos').parentElement?.querySelector('strong'))
      .toHaveClass('overBudgetValue');
    fireEvent.blur(input);
    expect(screen.getByText('¿Estás segura de asignar más horas?')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, continuar' }));
    expect(screen.getByText('¿Confirmas definitivamente que deseas asignar más horas de las vendidas?'))
      .toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar asignación' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      projectId: 'project-id',
      input: { teams: [{ teamId, leaderUserId: 'leader-1', memberCount: 2, assignedHours: 520 }] },
    }));
  });

  it('cancelar el excedente conserva el último valor guardado y no llama a la API', () => {
    mount(false);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    const input = screen.getByLabelText('Horas asignadas');
    fireEvent.change(input, { target: { value: '540' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Horas asignadas')).toHaveValue(300);
    expect(screen.queryByText(/Se superan las HH vendidas/)).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('evalúa la suma de equipos, no solo la asignación individual', () => {
    const detail = project(false);
    detail.teams.push({
      id: 'assignment-2', teamId: otherId, teamName: 'QA', teamSlug: 'qa',
      leader: null, assignedHours: 200, memberCount: 0, maxMembers: 1,
    } as ProjectDetail['teams'][number]);
    mount(false, detail);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    const firstInput = screen.getAllByLabelText('Horas asignadas')[0];
    fireEvent.change(firstInput, { target: { value: '301' } });
    fireEvent.blur(firstInput);
    expect(screen.getByRole('alert')).toHaveTextContent('Se superan las HH vendidas por 1 HH');
    expect(screen.getByText('¿Estás segura de asignar más horas?')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

});
