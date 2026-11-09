import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DashboardMyTask, HourEntryDetail, HourEntrySummary } from '@kora/contracts';
import { RecentHistoryCard } from './RecentHistoryCard';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', role: 'collaborator' } }),
}));
vi.mock('@/modules/hours/api/hours.queries', () => ({
  useHourEntriesList: mocks.list,
  useHourEntryDetail: mocks.detail,
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: vi.fn() }),
}));
// La integración real usa el formulario de /horas. Aquí validamos únicamente
// que se abre con el registro correcto, no volvemos a probar el formulario.
vi.mock('@/modules/hours/components/HourEntryFormDialog', () => ({
  HourEntryFormDialog: ({ open, entry, onClose, onSuccess }: {
    open: boolean;
    entry: HourEntrySummary | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
  }) => open && entry ? <div role="dialog" aria-label="Formulario de edición">
    <span>Edición de {entry.id}</span>
    <button type="button" onClick={onClose}>Cancelar edición</button>
    <button type="button" onClick={() => onSuccess('Guardado')}>Simular guardado</button>
  </div> : null,
}));

const dateInMonth = (monthOffset: number) => {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() + monthOffset, 5);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), '05'].join('-');
};

const current = dateInMonth(0);
const previous = dateInMonth(-1);
const record = (id: string, date: string, status: HourEntrySummary['status']): HourEntrySummary => ({
  id, date, status, hours: 4,
  user: { id: 'u-1', fullName: 'Colaborador de prueba' },
  project: { id: 'p-1', name: 'Portal Herramientas' },
  team: { id: 'team-1', name: 'UX-UI' },
  module: { id: 'm-1', name: 'Fase de diseño' },
  segment: { id: 's-1', name: 'Diseño de flujos y pantallas' },
  taskId: 't-1', assignment: 'Proyecto',
  category: 'Wireframes reservas', description: 'Wireframes reservas.',
  isOvertime: false, hasBlocker: false, blockerDescription: null,
  projectStageAtEntry: null, rejectionReason: null,
  designatedApprover: null,
  projectApprovers: [{ id: 'leader-1', fullName: 'Solmary Castro' }],
  ticket: null, createdAt: '2026-10-29T16:00:00Z',
});
const pending = record('h-pending', current, 'pending');
const approved = record('h-approved', previous, 'approved');
const closedPending = record('h-closed', previous, 'pending');
const task = {
  id: 't-1', title: 'Wireframes flujo de reservas', projectId: 'p-1',
  moduleId: 'm-1', projectName: 'Portal Herramientas', moduleName: 'Fase de diseño',
  date: current, status: 'done', completedAt: null, rejectionReason: null,
} satisfies DashboardMyTask;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockReturnValue({
    data: { items: [pending, approved, closedPending], total: 3, pageCount: 1, pageSize: 10, page: 1 },
    isLoading: false, error: null,
  });
  mocks.detail.mockImplementation((id: string | null) => ({
    data: id === approved.id ? {
      ...approved, decisionBy: { id: 'leader-1', fullName: 'Solmary Castro' },
      decisionAt: '2026-10-29T20:00:00Z',
      legacyId: null, updatedAt: '2026-10-29T20:00:00Z',
    } satisfies HourEntryDetail : null,
    isLoading: false, isError: false,
  }));
});

const show = () => render(<RecentHistoryCard
  weekStart={undefined} onWeekStartChange={vi.fn()} tasks={[task]} />);

describe('Historial reciente del colaborador', () => {
  it('permite editar la propia hora pendiente del mes, sin exponer edición de aprobadas', () => {
    show();
    const table = screen.getByRole('table', { name: 'Historial reciente de mis horas' });
    // Aprobadas y pendientes de un mes cerrado pueden compartir fecha.
    // Comprobar la fila aprobada, no todos los botones con esa fecha.
    const approvedRow = within(table).getAllByText('Portal Herramientas')[1]!.closest('tr')!;
    expect(within(approvedRow).queryByRole('button', {
      name: 'Editar registro del ' + approved.date.slice(8, 10)
        + '/' + approved.date.slice(5, 7) + '/' + approved.date.slice(0, 4),
    })).not.toBeInTheDocument();
    const ownEdit = within(table).getByRole('button', { name: 'Editar registro del ' + current.slice(8, 10)
      + '/' + current.slice(5, 7) + '/' + current.slice(0, 4) });
    expect(ownEdit).toBeEnabled();
    fireEvent.click(ownEdit);
    expect(screen.getByRole('dialog', { name: 'Formulario de edición' }))
      .toHaveTextContent('Edición de h-pending');
    fireEvent.click(screen.getByRole('button', { name: 'Simular guardado' }));
    expect(mocks.success).toHaveBeenCalledWith('Guardado');
    expect(screen.queryByRole('dialog', { name: 'Formulario de edición' })).not.toBeInTheDocument();
  });

  it('conserva el lápiz con explicación para horas pendientes de un mes ya cerrado', () => {
    show();
    const edit = screen.getByRole('button', { name: 'Editar registro del ' + previous.slice(8, 10)
      + '/' + previous.slice(5, 7) + '/' + previous.slice(0, 4) });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute('title', 'Solo se pueden editar registros del mes en curso');
  });

  it('el ojo presenta fase, bloque, tarea, bitácora y la decisión real del aprobador', () => {
    show();
    // Dos filas en octubre comparten fecha: seleccionar la fila aprobada.
    const approvedRow = screen.getAllByText('Portal Herramientas')[1]!.closest('tr')!;
    fireEvent.click(within(approvedRow).getByRole('button', { name: /Ver registro/ }));
    const dialog = screen.getByRole('dialog', { name: 'Detalle del registro' });
    for (const label of ['Fecha', 'Asignación', 'Proyecto', 'Fase',
      'Bloque de trabajo', 'Tarea', 'Actividad', 'Horas trabajadas', 'Descripción',
      'Bloqueo o problema', 'Estado']) {
      // El valor de Asignación también puede ser "Proyecto": consultar el título <dt>.
      expect(within(dialog).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Wireframes flujo de reservas')).toBeInTheDocument();
    expect(within(dialog).getByText('4 h')).toBeInTheDocument();
    expect(within(dialog).getByText('No')).toBeInTheDocument();
    expect(within(dialog).getByText('por Solmary Castro')).toBeInTheDocument();
    expect(mocks.detail).toHaveBeenCalledWith('h-approved');
    // El modal incluye X y botón inferior, ambos con aria-label "Cerrar".
    // Seleccionar expresamente el botón visible del pie.
    fireEvent.click(within(dialog).getByText('Cerrar', { selector: 'button' }));
    expect(screen.queryByRole('dialog', { name: 'Detalle del registro' })).not.toBeInTheDocument();
  });
});
