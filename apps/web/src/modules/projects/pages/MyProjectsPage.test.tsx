import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyProjectsPage } from './MyProjectsPage';

const mocks = vi.hoisted(() => ({ mine: vi.fn() }));
vi.mock('../api/projects.queries', () => ({ useMyProjects: mocks.mine }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe('Mis proyectos del colaborador', () => {
  it('usa la lista propia, enlace al proyecto, avance y HH semanales sin controles de gestión', () => {
    mocks.mine.mockReturnValue({ isLoading: false, error: null, data: {
      page: 1, pageSize: 10, pageCount: 1, total: 1, items: [{
        id: 'p-1', slug: 'mejoras-kora', name: 'Mejoras Kora',
        client: { id: 'c-1', companyName: 'Kabeli' },
        leader: { id: 'u-1', fullName: 'Solmari Castro' },
        phase: null, status: 'active', type: 'development',
        startDate: '2026-10-19', endDate: '2026-11-20',
        progress: { actual: 19, expected: 41, delay: 22, estimatedByCount: false },
        weekHours: 21,
      }] },
    });
    render(<MemoryRouter><MyProjectsPage /></MemoryRouter>);
    const table = screen.getByRole('table', { name: 'Mis proyectos' });
    expect(within(table).getByText('21 HH')).toBeInTheDocument();
    expect(within(table).getByText('19%')).toBeInTheDocument();
    expect(within(table).getByText('Solmari Castro')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Abrir proyecto Mejoras Kora' }))
      .toHaveAttribute('href', '/mis-proyectos/mejoras-kora');
    expect(screen.queryByRole('button', { name: /editar|eliminar|planificar/i })).not.toBeInTheDocument();
    expect(mocks.mine).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 10 }));
  });
  it('sin HH operativas, App Walvy muestra plazo calendario y no avance real', () => {
    mocks.mine.mockReturnValue({ isLoading: false, error: null, data: {
      page: 1, pageSize: 10, pageCount: 1, total: 1, items: [{
        id: 'p-2', slug: 'app-walvy', name: 'App Walvy',
        client: { id: 'c-1', companyName: 'Edificate Inteligente' },
        leader: null, phase: 'development', status: 'active', type: 'development',
        startDate: '2026-03-30', endDate: '2026-12-21',
        progress: { actual: null, expected: null, delay: null },
        weekHours: 0,
      }] },
    });
    render(<MemoryRouter><MyProjectsPage /></MemoryRouter>);
    const bar = screen.getByRole('progressbar', { name: 'Plazo calendario transcurrido de App Walvy' });
    expect(bar).toHaveAttribute('aria-valuenow');
    expect(screen.getByText('(plazo)')).toBeInTheDocument();
    expect(screen.queryByText('Sin plan')).not.toBeInTheDocument();
  });

  it('sin fechas ni plan no inventa un progreso', () => {
    mocks.mine.mockReturnValue({ isLoading: false, error: null, data: {
      page: 1, pageSize: 10, pageCount: 1, total: 1, items: [{
        id: 'p-3', slug: 'sin-fechas', name: 'Sin fechas',
        client: null, leader: null, phase: null, status: 'active', type: 'development',
        startDate: null, endDate: null, progress: { actual: null, expected: null }, weekHours: 0,
      }] },
    });
    render(<MemoryRouter><MyProjectsPage /></MemoryRouter>);
    expect(screen.getByText('Sin plan')).toBeInTheDocument();
    expect(screen.queryByText('(plazo)')).not.toBeInTheDocument();
  });
});
