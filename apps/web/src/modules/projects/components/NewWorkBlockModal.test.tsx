import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectDetail, ProjectModule, ProjectModuleDelivery, ProjectModuleSegment } from '@kora/contracts';
import { NewWorkBlockModal } from './NewWorkBlockModal';

const segment = {
  id: 'segment-1', moduleId: 'module-1', teamId: 'team-qa', teamName: 'QA',
  name: 'Bot de conciliación', startDate: '2026-09-07', endDate: '2026-10-16',
  estimatedHours: 80, closedAt: '2026-10-16T19:00:00Z', members: [],
} as ProjectModuleSegment;
const delivery = {
  id: 'delivery-1', segmentId: 'segment-1', teamId: 'team-qa',
  name: 'Bot de conciliación · QA', description: 'Evidencias UAT',
  estimatedDate: '2026-10-16', status: 'approved',
} as ProjectModuleDelivery;
const module = {
  id: 'module-1', name: 'Bot de conciliación', segments: [segment],
  tasks: [], deliveries: [delivery],
} as unknown as ProjectModule;
const project = {
  id: 'project-1', teams: [{
    teamId: 'team-qa', teamName: 'QA', assignedHours: 110,
  }], modules: [module],
} as unknown as ProjectDetail;

describe('Formulario completo de edición del bloque', () => {
  it('precarga fechas, HH y entrega de cierre, conservando el vínculo al guardar', () => {
    const onConfirm = vi.fn();
    render(<NewWorkBlockModal mode="edit"
      project={project} module={module}
      teamOptions={[{ value: 'team-qa', label: 'QA' }]}
      initialSegment={segment} initialDelivery={delivery} submitting={false}
      onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByRole('dialog', { name: 'Editar bloque de trabajo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Nombre del bloque/ })).toHaveValue('Bot de conciliación');
    expect(screen.getByRole('spinbutton', { name: /HH estimadas/ })).toHaveValue(80);
    expect(screen.getByRole('textbox', { name: /Nombre de la entrega/ }))
      .toHaveValue('Bot de conciliación · QA');
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del bloque/ }), {
      target: { value: 'Bot de conciliación ajustado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onConfirm).toHaveBeenCalledWith({
      teamId: 'team-qa', name: 'Bot de conciliación ajustado',
      startDate: '2026-09-07', endDate: '2026-10-16',
      estimatedHours: 80,
      closingDelivery: { name: 'Bot de conciliación · QA', description: 'Evidencias UAT' },
    });
  });

  it('permite editar bloque sin entrega y enviar closingDelivery null explícito', () => {
    const onConfirm = vi.fn();
    render(<NewWorkBlockModal mode="edit"
      project={project} module={module}
      teamOptions={[{ value: 'team-qa', label: 'QA' }]}
      initialSegment={segment} submitting={false}
      onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByRole('checkbox', { name: /Este bloque no tiene entrega/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      closingDelivery: null, estimatedHours: 80,
    }));
  });
});
