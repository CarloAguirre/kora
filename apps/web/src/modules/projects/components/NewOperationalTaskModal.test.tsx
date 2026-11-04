import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { NewOperationalTaskModal } from './NewOperationalTaskModal';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  onClose: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const moduleId = '0777e456-fd76-445e-83f1-afc25061c102';
const teamId = '0777e456-fd76-445e-83f1-afc25061c103';
const blockId = '0777e456-fd76-445e-83f1-afc25061c104';

vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) =>
    <div role="dialog" aria-label={title}>{children}{footer}</div>,
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('../api/projects.queries', () => ({
  useCreateProjectModuleTask: () => ({ isPending: false, mutateAsync: mocks.create }),
}));

const project = {
  id: projectId,
  teams: [{ teamId, teamName: 'Desarrollo' }],
  members: [],
  modules: [{
    id: moduleId,
    name: 'S3 · Desarrollo Frontend PWA',
    segments: [{
      id: blockId, teamId, name: 'Frontend PWA · Desarrollo',
      startDate: '2026-11-05', endDate: '2026-11-15',
    }],
  }],
} as unknown as ProjectDetail;

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({});
  mocks.onClose.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe('Nueva tarea operativa vinculada a bloque', () => {
  it('impide crear una tarea sin bloque, aunque tenga nombre y HH', () => {
    render(<NewOperationalTaskModal project={project} moduleId={moduleId}
      onClose={mocks.onClose} />);
    fireEvent.change(screen.getByLabelText('Título de la tarea'), {
      target: { value: 'Crear interfaz PWA' },
    });
    fireEvent.change(screen.getByLabelText('HH estimadas'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
      target: { value: '2026-11-05' },
    });
    fireEvent.change(screen.getByLabelText('Fecha límite'), {
      target: { value: '2026-11-15' },
    });
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('registra explícitamente el segmento seleccionado', async () => {
    render(<NewOperationalTaskModal project={project} moduleId={moduleId}
      onClose={mocks.onClose} />);
    fireEvent.change(screen.getByLabelText('Título de la tarea'), {
      target: { value: 'Crear interfaz PWA' },
    });
    fireEvent.change(screen.getByLabelText('HH estimadas'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText(/Bloque de trabajo/), {
      target: { value: blockId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      projectId, moduleId,
      input: expect.objectContaining({
        teamId, segmentId: blockId, name: 'Crear interfaz PWA', estimatedHours: 20,
        startDate: '2026-11-05', date: '2026-11-15',
      }),
    }));
  });
});
