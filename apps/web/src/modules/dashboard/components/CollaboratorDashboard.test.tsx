import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  DashboardHoursSummary, DashboardMyPlanning, DashboardMyTask,
} from '@kora/contracts';
import { CollaboratorDashboard } from './CollaboratorDashboard';
import buttonStyles from '@/shared/components/ui/Button.module.css';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  hours: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', firstName: 'Carlo' } }),
}));
vi.mock('@/modules/hours/api/hours.queries', () => ({
  useHourEntriesList: mocks.hours,
  useHourEntryDetail: mocks.detail,
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
  reviewerName: 'Eduardo Aranda',
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
const hours: DashboardHoursSummary = {
  todayHours: 8, weekHours: 32, weekTargetHours: 40, weekHolidayCount: 0,
  rejectedCount: 1, weekOvertimeHours: 0, monthOvertimeHours: 2,
};
const planning: DashboardMyPlanning = {
  weekStart: '2026-10-26',
  items: [{ type: 'project', projectName: 'Kora 2', hours: 24 }],
  totalHours: 24,
  teamName: 'Desarrollo',
  teamMembers: [
    { fullName: 'Compañera QA', items: [{ type: 'project', projectName: 'Pruebas Carlo', hours: 32 }],
      totalHours: 32 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(undefined);
  mocks.detail.mockReturnValue({ data: null, isLoading: false, isError: false });
  mocks.hours.mockReturnValue({
    isLoading: false, isError: false, error: null,
    data: {
      page: 1, pageCount: 1, pageSize: 10, total: 1,
      items: [{
        id: 'h-1', taskId: 't-1', date: '2026-10-28',
        user: { id: 'u-1', fullName: 'Carlo Aguirre' },
        project: { id: 'p-1', name: 'Kora 2' },
        module: { id: 'm-1', name: 'Mejoras y correcciones' },
        segment: { id: 's-1', name: 'Calculadora' },
        category: 'Modelo de datos: relaciones', description: 'Tablas y consultas',
        assignment: 'Proyecto', hours: 8, status: 'approved',
        projectApprovers: [{ id: 'leader-1', fullName: 'Eduardo Aranda' }],
      }],
    },
  });
});

const show = (extras: Partial<Parameters<typeof CollaboratorDashboard>[0]> = {}) => render(
  <CollaboratorDashboard
    firstName="Carlo" teamName="Desarrollo" activeProjectCount={1}
    tasks={tasks} hours={hours} planning={planning} loading={false}
    weekStart="2026-10-26" onWeekStartChange={vi.fn()}
    onRegisterHours={vi.fn()} canRegisterHours
    {...extras}
  />,
);

describe('Dashboard colaborador · homologación v6', () => {
  it('muestra KPIs existentes con datos reales y planificación/equipo autorizados', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Mi Panel de Actividad' })).toBeInTheDocument();
    expect(screen.getByText(/Hola, Carlo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar horas' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Progreso diario' }))
      .getByRole('img', { name: '100% de la jornada registrada' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Horas registradas esta semana' }))
      .getByText('32/40 horas')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Horas extra este mes' }))
      .getByText('2 horas')).toBeInTheDocument();
    const attention = screen.getByRole('region', { name: 'Atención requerida' });
    expect(within(attention).getByText('1 tarea por revisar')).toBeInTheDocument();
    expect(within(attention).getByText('1 devuelta por el líder')).toBeInTheDocument();
    expect(within(attention).queryByText(/esperando revisión/)).not.toBeInTheDocument();
    expect(within(attention).getByText('1 registro de horas rechazado')).toBeInTheDocument();

    const week = screen.getByRole('region', { name: 'Planificación semanal' });
    expect(within(week).getAllByText('24 HH')).toHaveLength(2);
    expect(within(week).getByText(/no equivalen a horas registradas/)).toBeInTheDocument();
    const team = screen.getByRole('region', { name: 'Mi equipo' });
    expect(within(team).getByText('Compañera QA')).toBeInTheDocument();
    expect(within(team).getByText('Pruebas Carlo')).toBeInTheDocument();
  });

  it('no marca tareas completadas en espera de aprobación como acción del colaborador', () => {
    show({
      tasks: [{ ...base, id: 't-review', title: 'Esperando líder', status: 'in_review',
        rejectionReason: null }],
      hours: { ...hours, rejectedCount: 0 },
    });
    const attention = screen.getByRole('region', { name: 'Atención requerida' });
    expect(within(attention).getByText('Todo al día')).toBeInTheDocument();
    expect(within(attention).queryByText(/revisar|devuelta|rechazado/i)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Mis tareas' }))
      .getByText('Esperando líder')).toBeInTheDocument();
  });

  it('muestra las tareas devueltas y registros rechazados del propio colaborador', () => {
    show({
      tasks: [{ ...base, id: 't-returned', title: 'Corregir modelo', status: 'in_progress',
        rejectionReason: 'Faltan cambios' }],
      hours: { ...hours, rejectedCount: 2 },
    });
    const attention = screen.getByRole('region', { name: 'Atención requerida' });
    expect(within(attention).getByText('1 tarea por revisar')).toBeInTheDocument();
    expect(within(attention).getByText('1 devuelta por el líder')).toBeInTheDocument();
    expect(within(attention).getByText('2 registros de horas rechazados')).toBeInTheDocument();
  });

  it('presenta cinco filtros, estados acumulativos y progreso de registro sin inventar HH', () => {
    show();
    const region = screen.getByRole('region', { name: 'Mis tareas' });
    expect(within(region).getByRole('tab', { name: 'Todas 4' })).toHaveAttribute('aria-selected', 'true');
    const returned = within(region).getByText('Modelo de datos').closest('article')!;
    expect(within(returned).getByText('En curso')).toBeInTheDocument();
    expect(within(returned).getByText('Devuelta')).toBeInTheDocument();
    expect(within(returned).getByText('Vencida')).toBeInTheDocument();
    expect(within(returned).getByText(/23 de 24 HH estimadas registradas/)).toBeInTheDocument();
    expect(within(returned).getByText(/16 aprobadas, 7 pendientes/)).toBeInTheDocument();

    fireEvent.click(within(region).getByRole('tab', { name: 'Completada 1' }));
    expect(within(region).getByText('Ajustes en vista')).toBeInTheDocument();
    expect(within(region).getByText('Esperando aprobación de Eduardo Aranda')).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('tab', { name: 'Aprobada 1' }));
    const approvedTask = within(region).getByText('Integración aprobada').closest('article')!;
    expect(within(approvedTask).getByText('Aprobada')).toBeInTheDocument();
    expect(within(approvedTask).getByText(/La aprobación de la tarea no completa automáticamente/))
      .toBeInTheDocument();
    fireEvent.click(within(region).getByRole('tab', { name: 'Pendiente 1' }));
    expect(within(region).getByText('Pantalla calculadora')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Empezar' })).toBeInTheDocument();
  });

  it('activa scroll interno solo con más de cinco tareas visibles y lo retira al filtrar', () => {
    const extraTasks: DashboardMyTask[] = Array.from({ length: 7 }, (_, index) => ({
      ...base, id: `scroll-${index}`, title: `Tarea ${index + 1}`,
      status: index < 3 ? 'todo' : 'in_progress',
      date: '2039-01-01', rejectionReason: null,
    }));
    show({ tasks: extraTasks });
    const tasksRegion = screen.getByRole('region', { name: 'Mis tareas' });
    const scrollable = within(tasksRegion).getByRole('region', {
      name: 'Lista desplazable de mis tareas',
    });
    expect(scrollable).toHaveAttribute('tabindex', '0');
    expect(scrollable.className).toContain('taskListScrollable');
    expect(within(scrollable).getAllByRole('article')).toHaveLength(7);

    // El filtro En curso solo contiene cuatro; por lo tanto no tiene scroll.
    fireEvent.click(within(tasksRegion).getByRole('tab', { name: 'En curso 4' }));
    expect(within(tasksRegion).queryByRole('region', {
      name: 'Lista desplazable de mis tareas',
    })).not.toBeInTheDocument();
    expect(within(tasksRegion).getAllByRole('article')).toHaveLength(4);

    fireEvent.click(within(tasksRegion).getByRole('tab', { name: 'Todas 7' }));
    expect(within(tasksRegion).getByRole('region', {
      name: 'Lista desplazable de mis tareas',
    })).toBeInTheDocument();
  });

  it('con cinco tareas no limita la altura del listado', () => {
    const five: DashboardMyTask[] = Array.from({ length: 5 }, (_, index) => ({
      ...base, id: `small-${index}`, title: `Tarea ${index + 1}`,
      status: 'todo', date: '2039-01-01', rejectionReason: null,
    }));
    show({ tasks: five });
    const tasksRegion = screen.getByRole('region', { name: 'Mis tareas' });
    expect(within(tasksRegion).getAllByRole('article')).toHaveLength(5);
    expect(within(tasksRegion).queryByRole('region', {
      name: 'Lista desplazable de mis tareas',
    })).not.toBeInTheDocument();
  });

  it('respeta transiciones: empezar -> en curso -> por aprobar, nunca aprueba unilateralmente', async () => {
    show();
    const region = screen.getByRole('region', { name: 'Mis tareas' });
    const running = within(region).getByText('Modelo de datos').closest('article')!;
    // Misma variante primaria y mismo hover que el botón 'Registrar horas'.
    const completeButton = within(running).getByRole('button', { name: 'Marcar completada' });
    const registerButton = screen.getByRole('button', { name: 'Registrar horas' });
    expect(completeButton).toHaveClass(buttonStyles.primary!);
    expect(registerButton).toHaveClass(buttonStyles.primary!);
    fireEvent.click(completeButton);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'p-1', moduleId: 'm-1', taskId: 't-1', input: { status: 'in_review' },
    }));
    const todo = within(region).getByText('Pantalla calculadora').closest('article')!;
    fireEvent.click(within(todo).getByRole('button', { name: 'Empezar' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({
      projectId: 'p-1', moduleId: 'm-1', taskId: 't-2', input: { status: 'in_progress' },
    }));
    expect(mocks.success).toHaveBeenCalledTimes(2);
  });

  it('historial usa mis entradas y permite ver vínculos reales sin modificar registros', () => {
    show();
    const table = screen.getByRole('table', { name: 'Historial reciente de mis horas' });
    expect(within(table).getByText('Modelo de datos: relaciones')).toBeInTheDocument();
    expect(within(table).getByText('Calculadora')).toBeInTheDocument();
    expect(within(table).getByText('Modelo de datos')).toBeInTheDocument();
    expect(within(table).getByText('Eduardo Aranda')).toBeInTheDocument();
    expect(mocks.hours).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', sortField: 'date', sortDirection: 'desc' }),
      expect.objectContaining({ enabled: true }),
    );
    fireEvent.click(within(table).getByRole('button', { name: 'Ver registro del 28/10/2026' }));
    const dialog = screen.getByRole('dialog', { name: 'Detalle del registro' });
    expect(within(dialog).getByText('Tablas y consultas')).toBeInTheDocument();
    expect(within(dialog).getByText('8 h')).toBeInTheDocument();
    expect(within(dialog).getByText('Bloqueo o problema')).toBeInTheDocument();
    expect(within(dialog).getByText('Tarea')).toBeInTheDocument();
    expect(within(dialog).getByText('Descripción')).toBeInTheDocument();
    expect(within(dialog).getByText('Estado')).toBeInTheDocument();
  });

  it('oculta registrar horas sin permiso y no muestra métricas inventadas', () => {
    show({ canRegisterHours: false, hours: null, planning: null });
    expect(screen.queryByRole('button', { name: 'Registrar horas' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Progreso diario' }))
      .getByText('No disponible')).toBeInTheDocument();
  });
});
