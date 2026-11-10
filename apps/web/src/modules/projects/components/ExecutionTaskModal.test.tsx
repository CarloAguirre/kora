import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectDetail, ProjectModuleTask } from '@kora/contracts';
import { ExecutionTaskModal } from './ExecutionTaskModal';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  onClose: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const moduleId = '0777e456-fd76-445e-83f1-afc25061c102';
const uxTeamId = '0777e456-fd76-445e-83f1-afc25061c103';
const devTeamId = '0777e456-fd76-445e-83f1-afc25061c104';
const devBlockId = '0777e456-fd76-445e-83f1-afc25061c105';

vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) =>
    <div role="dialog" aria-label={title}>{children}{footer}</div>,
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('../api/projects.queries', () => ({
  useUpdateProjectModuleTask: () => ({ isPending: false, mutateAsync: mocks.update }),
}));

const project = {
  id: projectId,
  teams: [
    { teamId: uxTeamId, teamName: 'UX-UI' },
    { teamId: devTeamId, teamName: 'Desarrollo' },
  ],
  members: [{ teamId: uxTeamId, userId: '0777e456-fd76-445e-83f1-afc25061c106',
    fullName: 'Diseñadora', userStatus: 'active', blockedAt: null }],
  modules: [{
    id: moduleId, name: 'S3 · Desarrollo Frontend PWA',
    segments: [{
      id: devBlockId, teamId: devTeamId, teamName: 'Desarrollo',
      name: 'Frontend PWA · Desarrollo', startDate: '2026-11-05',
      endDate: '2026-11-15', members: [],
    }],
  }],
} as unknown as ProjectDetail;

const task = {
  id: '0777e456-fd76-445e-83f1-afc25061c107',
  name: 'Desarrollo de interfaces de usuario en PWA',
  description: 'Referencia cotización 5e63a519-7620-4e4e-827b-1576093d8995 · WBS WBS-10 · Desarrollador Frontend PWA',
  teamId: uxTeamId, assigneeUserId: null, segmentId: null,
  status: 'todo', estimatedHours: 160,
  startDate: '2026-11-05', date: '2026-11-15',
} as unknown as ProjectModuleTask;

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue({});
  mocks.onClose.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe('Edición de tarea histórica sin bloque operativo', () => {
  it('permite corregir equipo y bloque aunque Desarrollo no tenga colaboradores asignados', async () => {
    render(<ExecutionTaskModal project={project} moduleId={moduleId}
      task={task} onClose={mocks.onClose} onDuplicate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Equipo responsable/), {
      target: { value: devTeamId },
    });
    expect(screen.getByLabelText('Asignado a')).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/Bloque de trabajo/), {
      target: { value: devBlockId },
    });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId, moduleId, taskId: task.id,
      input: expect.objectContaining({
        teamId: devTeamId, segmentId: devBlockId, assigneeUserId: null,
        estimatedHours: 160, status: 'todo',
        description: expect.stringContaining('Referencia cotización'),
      }),
    }));
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it('no permite al líder cambiar el equipo desde una vista restringida', () => {
    render(<ExecutionTaskModal project={project} moduleId={moduleId}
      task={task} allowedTeamId={uxTeamId}
      onClose={mocks.onClose} onDuplicate={vi.fn()} />);
    expect(screen.getByLabelText(/Equipo responsable/)).toBeDisabled();
    expect(screen.getByLabelText(/Equipo responsable/)).toHaveValue(uxTeamId);
  });
});
