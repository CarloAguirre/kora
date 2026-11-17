import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CollaboratorProjectDetail } from '@kora/contracts';
import { MyProjectBitacora } from './MyProjectBitacora';

const mocks = vi.hoisted(() => ({
  addObservation: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('../api/projects.queries', () => ({
  useAddProjectObservation: () => ({ mutateAsync: mocks.addObservation }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));

const project = {
  id: '0777e456-fd76-445e-83f1-afc25061c101',
  name: 'Mejoras Kora',
  modules: [{ id: '0777e456-fd76-445e-83f1-afc25061c102',
    name: 'Diseño UX', tasks: [], segments: [], deliveries: [] }],
  events: [], observations: [], activityTruncated: false,
} as unknown as CollaboratorProjectDetail;

beforeEach(() => {
  mocks.addObservation.mockReset().mockResolvedValue({ id: 'new-observation' });
  mocks.success.mockReset();
  mocks.error.mockReset();
});

describe('Bitácora del colaborador: alta de registros', () => {
  it('muestra Agregar registro, abre el formulario del proyecto y utiliza Observación general por defecto', () => {
    render(<MyProjectBitacora project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar registro' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar registro a la bitácora' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de registro')).toHaveValue('observacion');
    expect(screen.getByLabelText('Fase relacionada (opcional)')).toHaveTextContent('Fase 1 — Diseño UX');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Agregar registro a la bitácora' })).not.toBeInTheDocument();
  });

  it('guarda un registro vinculado a fase como observación sin activar cierre de hito y refresca filtros', async () => {
    render(<MyProjectBitacora project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar registro' }));
    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Cliente confirma alcance' },
    });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Queda pendiente validar prototipo con UX.' },
    });
    fireEvent.change(screen.getByLabelText('Fase relacionada (opcional)'), {
      target: { value: project.modules[0]!.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
    await waitFor(() => expect(mocks.addObservation).toHaveBeenCalledOnce());
    expect(mocks.addObservation).toHaveBeenCalledWith({
      projectId: project.id,
      input: expect.objectContaining({
        type: 'observacion',
        title: 'Cliente confirma alcance',
        message: 'Queda pendiente validar prototipo con UX.',
        moduleId: project.modules[0]!.id,
      }),
    });
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Se agregó el registro a la bitácora.'));
    expect(screen.queryByRole('dialog', { name: 'Agregar registro a la bitácora' })).not.toBeInTheDocument();
  });

  it('muestra error y mantiene abierto el formulario ante rechazo del servidor', async () => {
    mocks.addObservation.mockRejectedValueOnce(new Error('network'));
    render(<MyProjectBitacora project={project} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar registro' }));
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Nueva observación del colaborador' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo agregar el registro.');
    expect(screen.getByRole('dialog', { name: 'Agregar registro a la bitácora' })).toBeInTheDocument();
  });
});
