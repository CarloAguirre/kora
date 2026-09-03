import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectDetail } from '@kora/contracts';
import { EditProjectDialog } from './EditProjectDialog';

const mutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('../api/projects.queries', () => ({
  useUpdateProject: () => ({ mutateAsync }),
}));

vi.mock('@/modules/clients/api/clients.queries', () => ({
  useClientsList: () => ({
    data: { items: [{ id: '11111111-1111-4111-8111-111111111111', companyName: 'Cliente SA' }] },
  }),
}));

vi.mock('@/modules/users/api/users.queries', () => ({
  useUsersList: () => ({ data: { items: [] } }),
}));

function buildProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'project-1',
    name: 'Proyecto de prueba',
    client: { id: '11111111-1111-4111-8111-111111111111', companyName: 'Cliente SA' },
    type: 'development',
    salesStage: 'approved',
    status: 'active',
    phase: 'development',
    priority: 'high',
    leader: null,
    soldHours: 500,
    usedHours: 629,
    assignedMemberCount: 0,
    plannedHours: 0,
    startDate: '2026-01-01',
    endDate: null,
    actualProgress: 40,
    supportPlanDescription: null,
    supportHours: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    developer: null,
    commercialManager: null,
    primaryContact: null,
    estimatedDeliveryDate: null,
    expectedProgress: 50,
    overtimeRateUf: 0,
    quotationLink: null,
    contractLink: null,
    additionalLinks: null,
    teams: [],
    members: [],
    observations: [],
    legacyId: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EditProjectDialog', () => {
  it('precarga el formulario con los datos actuales del proyecto', () => {
    render(
      <EditProjectDialog open project={buildProject()} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(screen.getByLabelText(/Nombre del proyecto/)).toHaveValue('Proyecto de prueba');
    expect(screen.getByLabelText('HH vendidas')).toHaveValue(500);
  });

  it('muestra los campos de desarrollo (etapa, avance) y no los de soporte', () => {
    render(
      <EditProjectDialog open project={buildProject({ type: 'development' })} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(screen.getByLabelText('Etapa comercial')).toBeInTheDocument();
    expect(screen.getByLabelText('Avance real (%)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Horas de soporte')).not.toBeInTheDocument();
  });

  it('muestra los campos de soporte y no los de desarrollo', () => {
    render(
      <EditProjectDialog
        open
        project={buildProject({ type: 'support', salesStage: null, phase: null, actualProgress: null, expectedProgress: null })}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Horas de soporte')).toBeInTheDocument();
    expect(screen.getByLabelText('Plan de soporte')).toBeInTheDocument();
    expect(screen.queryByLabelText('Etapa comercial')).not.toBeInTheDocument();
  });

  it('envía los cambios al guardar', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <EditProjectDialog open project={buildProject()} onClose={vi.fn()} onSuccess={onSuccess} />,
    );

    const nameField = screen.getByLabelText(/Nombre del proyecto/);
    await user.clear(nameField);
    await user.type(nameField, 'Proyecto renombrado');
    // El botón "Guardar cambios" vive en el footer del `Modal` y envía el
    // formulario por el atributo `form=`, no por anidamiento — jsdom no
    // implementa esa asociación, así que se envía el formulario directamente.
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          input: expect.objectContaining({ name: 'Proyecto renombrado' }),
        }),
      ),
    );
    expect(onSuccess).toHaveBeenCalledWith('Se actualizaron los datos de Proyecto renombrado.');
  });
});
