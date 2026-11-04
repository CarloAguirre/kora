import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { ProjectManagerTeamDetailView } from './ProjectManagerTeamDetailView';

vi.mock('./TeamTasksCard', () => ({
  TeamTasksCard: () => <section aria-label="Tareas del equipo">Tabla de tareas</section>,
}));
vi.mock('./TeamDeliveriesCard', () => ({
  TeamDeliveriesCard: () => <section aria-label="Entregas del equipo">Tabla de entregas</section>,
}));

const teamId = 'a4f483b9-c8dc-482e-9b62-2c183b5f19bf';
const project = {
  id: 'project-1', name: 'Ruta Viva', client: { companyName: 'Abarca Motores' },
  commercialManager: { fullName: 'Rodrigo Viveros' }, leader: { fullName: 'Solmari Castro' },
  status: 'active', phase: 'discovery', startDate: '2026-11-04',
  estimatedDeliveryDate: '2027-01-03',
  teams: [{ teamId, teamName: 'Desarrollo', leader: { id: 'leader-1', fullName: 'Eduardo Aranda' },
    assignedHours: 679, maxMembers: 2 }],
  members: [],
  modules: [{ id: 'module-1', name: 'Agendamiento de mantenciones',
    deliveries: [],
    segments: [{ id: 'segment-1', teamId, name: 'Agendamiento',
      startDate: '2026-11-04', endDate: '2027-01-03', estimatedHours: 679 }],
    tasks: [{ id: 'task-1', teamId, name: 'Conexión con taller', assigneeUserId: null,
      status: 'todo', estimatedHours: 35 }] }],
} as unknown as ProjectDetail;

describe('Ficha existente del equipo — enriquecimiento PMO/PM', () => {
  it('muestra datos del proyecto, KPIs y alerta de tareas sin colaborador', () => {
    render(<ProjectManagerTeamDetailView project={project} projectId={project.id} teamId={teamId} />);
    expect(screen.getByText('Abarca Motores')).toBeInTheDocument();
    expect(screen.getByText('Rodrigo Viveros')).toBeInTheDocument();
    expect(screen.getByText(/Líder: Eduardo Aranda/)).toBeInTheDocument();
    const assignedHoursKpi = screen.getByText('HH asignadas').closest('div');
    expect(assignedHoursKpi).not.toBeNull();
    expect(within(assignedHoursKpi!).getByText('679')).toBeInTheDocument();
    expect(screen.getByText('Agendamiento de mantenciones: 1 tarea espera asignación')).toBeInTheDocument();
    expect(screen.getByLabelText('Tareas del equipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Entregas del equipo')).toBeInTheDocument();
  });

  it('conserva la sección de explicación desplegable para la próxima iteración', () => {
    render(<ProjectManagerTeamDetailView project={project} projectId={project.id} teamId={teamId} />);
    const button = screen.getByRole('button', { name: /Cómo se calcula este avance/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/El avance real considera las HH estimadas/)).toBeInTheDocument();
  });
});
