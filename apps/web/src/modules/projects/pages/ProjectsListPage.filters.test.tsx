import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsListPage } from './ProjectsListPage';

vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('../components/ProjectsSummaryChart', () => ({ ProjectsSummaryChart: () => null }));
vi.mock('@/shared/components/ui/DataTable', () => ({ DataTable: () => null }));
vi.mock('@/shared/components/ui/MultiSelect', () => ({
  MultiSelect: ({ label }: { label: string }) => <div data-testid="project-filter">{label}</div>,
}));
vi.mock('@/shared/components/ui/ConfirmActionDialog', () => ({ ConfirmActionDialog: () => null }));
vi.mock('../api/projects.queries', () => ({
  useProjectsList: () => ({ data: undefined, isLoading: false, error: null }),
  useDeleteProject: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/modules/clients/api/clients.queries', () => ({
  useClientsList: () => ({ data: { items: [] } }),
}));
vi.mock('@/modules/users/api/users.queries', () => ({
  useUsersList: () => ({ data: { items: [] } }),
}));
vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => false }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn() }),
}));

describe('Proyectos: controles de filtrado', () => {
  it('mantiene Líder/Tipo/Estado/Etapa y no agrega filtro Cotización', () => {
    render(<MemoryRouter><ProjectsListPage /></MemoryRouter>);
    expect(screen.getAllByTestId('project-filter').map((element) => element.textContent)).toEqual([
      'Líder', 'Tipo de proyecto', 'Estado', 'Etapa',
    ]);
  });
});
