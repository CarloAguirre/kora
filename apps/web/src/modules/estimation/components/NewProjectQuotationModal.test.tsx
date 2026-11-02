import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { NewProjectQuotationModal } from './NewProjectQuotationModal';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), close: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useNavigate: () => mocks.navigate };
});
vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: {
    title: string; children: ReactNode; footer?: ReactNode;
  }) => <div role="dialog" aria-label={title}>{children}{footer}</div>,
}));
vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (name: string) => name === 'projects:manage' }),
}));
vi.mock('@/modules/projects/api/projects.queries', () => ({
  useProjectsList: () => ({ data: { items: [] } }),
}));
vi.mock('../api/quotation.queries', () => ({
  useProjectQuotation: () => ({ data: null, isLoading: false, error: null }),
  useCreateQuotationVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('./AiQuotationWizardModal', () => ({
  AiQuotationWizardModal: ({ project }: { project: ProjectDetail }) =>
    <div role="dialog" aria-label="Asistente IA de cinco etapas">
      <h2>Asistente de {project.name}</h2>
    </div>,
}));
const project = {
  id: '0777e456-fd76-445e-83f1-afc25061c101',
  name: 'Motor de notificaciones', slug: 'motor-de-notificaciones',
  client: { companyName: 'Amicar' },
} as unknown as ProjectDetail;

describe('Nueva cotización · entrada al flujo v5', () => {
  it('abre las cinco etapas en un modal sin saltar a la página PoC', () => {
    mocks.navigate.mockClear();
    render(<MemoryRouter><NewProjectQuotationModal
      project={project} versions={[]} onClose={mocks.close}
    /></MemoryRouter>);
    expect(screen.getByRole('dialog', { name: 'Nueva cotización' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('dialog', { name: 'Asistente IA de cinco etapas' }))
      .toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
