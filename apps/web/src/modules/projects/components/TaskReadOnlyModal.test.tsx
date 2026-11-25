import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectModule, ProjectModuleTask } from '@kora/contracts';
import { TaskReadOnlyModal } from './TaskReadOnlyModal';

vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) =>
    <div role="dialog" aria-label={title}>{children}{footer}</div>,
}));

const blockId = '0777e456-fd76-445e-83f1-afc25061c101';
const module = {
  id: '0777e456-fd76-445e-83f1-afc25061c102',
  name: 'Investigación',
  segments: [{
    id: blockId, teamId: '0777e456-fd76-445e-83f1-afc25061c103',
    teamName: 'Desarrollo', name: 'Diseño de solución',
  }],
} as unknown as ProjectModule;

const task = {
  id: '0777e456-fd76-445e-83f1-afc25061c104',
  name: 'Investigación Framework agentico 1',
  description: 'Bloque de trabajo: Diseño de solución · ID ' + blockId +
    '\nVIDEO 1: https://www.youtube.com/watch?v=ejemplo' +
    '\nVIDEO 2: https://www.youtube.com/watch?v=ejemplo2',
  teamId: '0777e456-fd76-445e-83f1-afc25061c103',
  teamName: 'Desarrollo',
  assigneeUserId: '0777e456-fd76-445e-83f1-afc25061c105',
  assigneeName: 'Carlo Aguirre',
  segmentId: blockId, segmentName: 'Diseño de solución',
  status: 'in_progress', estimatedHours: 33,
  startDate: '2026-11-24', date: '2026-12-31',
} as ProjectModuleTask;

describe('Consulta de tarea del colaborador', () => {
  it('muestra los mismos campos del editor en solo lectura, blancos y sin acciones de edición', () => {
    const onClose = vi.fn();
    render(<TaskReadOnlyModal module={module} task={task} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Detalle de tarea' });

    const values: Record<string, string> = {
      'Título de la tarea': 'Investigación Framework agentico 1',
      'Equipo responsable': 'Desarrollo',
      'Asignado a': 'Carlo Aguirre',
      'Módulo relacionado': 'Investigación',
      'Bloque de trabajo': 'Diseño de solución',
      Estado: 'En curso',
      'HH estimadas': '33',
      'Fecha de inicio': '24-11-2026',
      'Fecha límite': '31-12-2026',
    };
    for (const [label, value] of Object.entries(values)) {
      const input = within(dialog).getByRole('textbox', { name: label });
      expect(input).toHaveValue(value);
      expect(input).toHaveAttribute('readonly');
      expect(input).not.toBeDisabled();
    }

    const description = within(dialog).getByRole('textbox', { name: 'Descripción' });
    const descriptionValue = (description as HTMLTextAreaElement).value;
    expect(descriptionValue).toContain('VIDEO 1:');
    expect(descriptionValue).toContain('VIDEO 2:');
    expect(descriptionValue).not.toContain('Bloque de trabajo:');
    expect(description).toHaveAttribute('readonly');
    expect(description).not.toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: /guardar|duplicar|editar|calendario/i }))
      .not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('conserva el asignado histórico y muestra los campos de una tarea sin bloque', () => {
    render(<TaskReadOnlyModal module={module} onClose={vi.fn()} task={{
      ...task, segmentId: null, segmentName: null,
      assigneeUserId: null, assigneeName: null,
      description: 'Referencia cotización X\nNotas internas visibles',
      status: 'todo',
    }} />);
    expect(screen.getByRole('textbox', { name: 'Asignado a' })).toHaveValue('Sin asignar');
    expect(screen.getByRole('textbox', { name: 'Estado' })).toHaveValue('Por asignar');
    expect(screen.getByRole('textbox', { name: 'Bloque de trabajo' })).toHaveValue('Sin bloque planificado');
    expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveValue('Notas internas visibles');
  });
});
