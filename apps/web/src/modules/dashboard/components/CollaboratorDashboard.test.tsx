import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DashboardMyTask } from '@kora/contracts';
import { CollaboratorDashboard } from './CollaboratorDashboard';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  hours: vi.fn(),
}));

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', firstName: 'Carlo' } }),
}));
vi.mock('@/modules/hours/api/hours.queries', () => ({
  useHourEntriesList: mocks.hours,
}));
vi.mock('@/modules/projects/api/projects.queries', () => ({
  useUpdateProjectModuleTask: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));

const base = {
  projectId: 'p-1',
  projectName: 'Kora 2',
  moduleId: 'm-1',
  moduleName: 'Mejoras y correcciones',
  segmentName: 'Calculadora',
  estimatedHours: 24,
  approvedHours: 16,
  pendingHours: 7,
  date: '2020-10-29',
  completedAt: null,
  rejectionReason: null,
} satisfies Omit<DashboardMyTask, 'id' | 'title' | 'status'>;

const tasks: DashboardMyTask[] = [
  { ...base, id: 't-1', title: 'Modelo de datos', status: 'in_progress', rejectionReason: 'Faltan campos' },
  { ...base, id: 't-2', title: 'Pantalla calculadora', status: 'todo', rejectionReason: null, date: '2039-01-01' },
  { ...base, id: 't-3', title: 'Ajustes en vista', status: 'in_review', rejectionReason: null },
  { ...base, id: 't-4', title: 'Integración aprobada', status: 'done', rejectionReason: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(undefined);
  mocks.hours.mockReturnValue({
    isLoading: false, isError: false,
    data: { items: [{
      id: 'h-1', taskId: 't-1', date: '2026-10-28', project: { id: 'p-1', name: 'Kora 2' },
      module: { id: 'm-1', name: 'Mejoras y correcciones' },
      segment: { id: 's-1', name: 'Calculadora' }, category: 'Modelo de datos: relaciones', hours: 8, status: 'approved',
    }] },
  });
});

const show = () => render(
  <CollaboratorDashboard firstName="Carlo" teamName="Desarrollo" activeProjectCount={1}
    tasks={tasks} loading={false} onRegisterHours={vi.fn()} canRegisterHours />,
);

describe('Dashboard colaborador v5.02', () => {
  it('separa Por hacer, Por aprobar y Aprobadas y muestra chips acumulativos', () => {
    show();
    expect(screen.getByText('Hola, Carlo')).toBeInTheDocument();
    expect(screen.getByText('Desarrollo, en 1 proyecto')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Por hacer 2/ })).toHaveAttribute('aria-selected', 'true');
    const returned = screen.getByText('Modelo de datos').closest('article')!;
    expect(within(returned).getByText('En curso')).toBeInTheDocument();
    expect(within(returned).getByText('Devuelta')).toBeInTheDocument();
    expect(within(returned).getByText('Vencida')).toBeInTheDocument();
    expect(within(returned).getByText(/24 HH estimadas, 16 aprobadas y 7 por aprobar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Por aprobar 1/ }));
    expect(screen.getByText('Ajustes en vista')).toBeInTheDocument();
    expect(screen.getByText('Completada')).toBeInTheDocument();
    expect(screen.getByText('Esperando aprobación del líder')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Aprobadas 1/ }));
    expect(screen.getByText('Integración aprobada')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
  });

  it('marcar terminada envía la tarea a revisión, nunca directo a done', async () => {
    show();
    const task = screen.getByText('Modelo de datos').closest('article')!;
    fireEvent.click(within(task).getByRole('button', { name: 'Marcar terminada' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'p-1', moduleId: 'm-1', taskId: 't-1', input: { status: 'in_review' },
    }));
    expect(mocks.success).toHaveBeenCalled();
  });

  it('muestra registros aprobados propios con contexto de tarea y sin fabricar HH', () => {
    show();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Modelo de datos: relaciones')).toBeInTheDocument();
    expect(within(table).getByText('Calculadora')).toBeInTheDocument();
    expect(within(table).getByText('8')).toBeInTheDocument();
    expect(mocks.hours).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', sortField: 'date', sortDirection: 'desc' }),
      expect.objectContaining({ enabled: true }),
    );
  });
});
