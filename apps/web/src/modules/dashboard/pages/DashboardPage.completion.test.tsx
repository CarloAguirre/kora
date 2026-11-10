import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DashboardMyTask } from '@kora/contracts';
import { DashboardPage } from './DashboardPage';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
const task: DashboardMyTask = {
  id: 'task-1', projectId: 'p-1', moduleId: 'm-1',
  projectName: 'Kora 2', moduleName: 'Arquitectura', title: 'Diseño',
  segmentName: 'UX-UI', status: 'in_progress', estimatedHours: 20,
  approvedHours: 6, pendingHours: 0, date: '2026-12-01',
  reviewerName: null, completedAt: null, rejectionReason: null,
};

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', role: 'collaborator', firstName: 'Carlo' } }),
}));
vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));
vi.mock('../api/dashboard.queries', () => ({
  useDashboardSummary: () => ({ data: { myActiveProjects: [], myTasks: [task], planning: null, hours: null }, isLoading: false }),
}));
vi.mock('@/modules/projects/api/projects.queries', () => ({
  useUpdateProjectModuleTask: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../components/CollaboratorDashboard', () => ({
  CollaboratorDashboard: ({ onRegisterHoursAndComplete, onRegisterHours }: {
    onRegisterHoursAndComplete: (task: DashboardMyTask) => void;
    onRegisterHours: () => void;
  }) => <>
    <button onClick={() => onRegisterHoursAndComplete(task)}>Registrar y completar</button>
    <button onClick={onRegisterHours}>Registrar normalmente</button>
  </>,
}));
vi.mock('@/modules/hours/components/HourEntryFormDialog', () => ({
  HourEntryFormDialog: ({ open, initialTask, onClose, onSuccess }: {
    open: boolean;
    initialTask?: { projectId: string; moduleId: string; taskId: string; taskTitle: string };
    onClose: () => void;
    onSuccess: (message: string) => void;
  }) => open ? <div role="dialog" aria-label="Registrar horas">
    <div>{initialTask ? 'Tarea vinculada: ' + initialTask.taskId : 'Registro normal'}</div>
    <button onClick={onClose}>Cancelar registro</button>
    <button onClick={() => onSuccess('Se registraron las horas.')}>Guardar registro</button>
  </div> : null,
}));
vi.mock('../components/DashboardMySummary', () => ({ DashboardMySummary: () => null }));
vi.mock('./DashboardProjectsTab', () => ({ DashboardProjectsTab: () => null }));
vi.mock('./DashboardSupportTab', () => ({ DashboardSupportTab: () => null }));
vi.mock('../components/OvertimeReportSection', () => ({ OvertimeReportSection: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(undefined);
});

describe('Dashboard: registrar horas y completar tarea', () => {
  it('no completa nada si el colaborador cancela el formulario', () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y completar' }));
    expect(screen.getByText('Tarea vinculada: task-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar registro' }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Registrar horas' })).not.toBeInTheDocument();
  });

  it('completa únicamente tras guardar las HH de la tarea vinculada', async () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y completar' }));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'p-1', moduleId: 'm-1', taskId: 'task-1',
      input: { status: 'in_review' },
    }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(
      'Horas registradas y tarea enviada a aprobación.',
    ));
  });

  it('informa el fallo de completar sin afirmar que las horas se perdieron', async () => {
    mocks.update.mockRejectedValueOnce(new Error('conflicto'));
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y completar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(
      expect.stringContaining('Las horas quedaron registradas'),
    ));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('registrar normalmente no inicia transición de tarea', () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar normalmente' }));
    expect(screen.getByText('Registro normal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith('Se registraron las horas.');
  });
});
