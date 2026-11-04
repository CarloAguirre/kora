import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppliedQuotationPlanning, ProjectDetail, ProjectModule } from '@kora/contracts';
import { AssignBlockTasksModal } from './AssignBlockTasksModal';

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'task-new' }),
  update: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../api/projects.queries', () => ({
  useCreateProjectModuleTask: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateProjectModuleTask: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
const project = {
  id: 'project-1',
  teams: [{ teamId: 'team-qa', teamName: 'QA' }],
  members: [{ userId: 'user-qa', teamId: 'team-qa', fullName: 'Ana Soto', userStatus: 'active' }],
} as unknown as ProjectDetail;
const block = {
  id: 'segment-1', teamId: 'team-qa', name: 'Pruebas de calidad',
  startDate: '2026-11-05', endDate: '2026-11-20',
};
const module = {
  id: 'module-1', name: 'Aseguramiento QA',
  segments: [block], tasks: [],
} as unknown as ProjectModule;
const reference = {
  wbs: '1.2', name: 'Casos de prueba',
  description: 'Preparación de casos', role: 'QA',
  teamId: 'team-qa', hours: 18,
} as AppliedQuotationPlanning['modules'][number]['tasks'][number];

describe('Asignación masiva de EDT y tareas operativas', () => {
  it('conserva HH y fechas del bloque al convertir y asignar una tarea de cotización', async () => {
    mocks.create.mockClear();
    const onClose = vi.fn();
    render(<AssignBlockTasksModal project={project} module={module}
      teamId="team-qa" referenceTasks={[reference]} versionId="version-1" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Asignar tareas · Aseguramiento QA' })).toBeInTheDocument();
    expect(screen.getByText('Casos de prueba')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('combobox', { name: 'Asignado a Casos de prueba' }))
      .toHaveValue('user-qa');
    fireEvent.click(screen.getByRole('button', { name: 'Asignar tareas' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1',
      input: expect.objectContaining({
        name: 'Casos de prueba', teamId: 'team-qa',
        segmentId: 'segment-1', assigneeUserId: 'user-qa',
        estimatedHours: 18, scope: 'qa', status: 'todo',
        startDate: '2026-11-05', date: '2026-11-20',
        description: expect.stringContaining('Referencia cotización version-1'),
      }),
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('al asignar tarea existente conserva su FK al bloque y no vuelve a crearla', async () => {
    mocks.update.mockClear();
    mocks.create.mockClear();
    const existing = {
      id: 'task-1', teamId: 'team-qa', segmentId: 'segment-1',
      name: 'Ejecución de regresión', estimatedHours: 24,
      startDate: '2026-11-05', date: '2026-11-20',
      description: null, assigneeUserId: null,
    };
    const withTask = { ...module, tasks: [existing] } as unknown as ProjectModule;
    render(<AssignBlockTasksModal project={project} module={withTask}
      teamId="team-qa" referenceTasks={[]} versionId="version-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar tareas' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', taskId: 'task-1',
      input: expect.objectContaining({
        segmentId: 'segment-1', teamId: 'team-qa',
        assigneeUserId: 'user-qa', status: 'todo',
      }),
    }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
