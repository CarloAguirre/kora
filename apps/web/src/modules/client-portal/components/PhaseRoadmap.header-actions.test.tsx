import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhaseRoadmap } from './PhaseRoadmap';
import type { ProjectPhaseRoadmap } from '../types';

const phaseRoadmap: ProjectPhaseRoadmap = {
  phaseCount: 1,
  teamSegmentCount: 0,
  plannedDeliveryCount: 0,
  rangeStartDate: '2026-11-01',
  rangeEndDate: '2026-12-01',
  phases: [{
    id: 'phase-2',
    badge: 'FASE 2',
    name: 'Desarrollo Backend',
    status: 'upcoming',
    alertLabel: null,
    tasks: [],
    deliveries: [],
    taskItems: [],
    relatedBitacora: [],
  }],
};

describe('Extensiones de cabecera en Roadmap compartido', () => {
  it('mantiene el nombre y encabezado del portal cliente cuando no hay acciones internas', () => {
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap} />);
    expect(screen.getByText('Desarrollo Backend')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Bloque de trabajo' })).not.toBeInTheDocument();
  });

  it('acciones y campo editable no despliegan/contraen la fase accidentalmente', () => {
    const addBlock = vi.fn();
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap}
      toolbarActions={<button type="button">Planificar</button>}
      renderPhaseHeaderName={() => <input aria-label="Nombre de la fase"
        defaultValue="Desarrollo Backend" />}
      renderPhaseHeaderActions={() => (
        <button type="button" onClick={addBlock}>+ Bloque de trabajo</button>
      )} />);
    const header = screen.getAllByRole('button').find((element) =>
      element.getAttribute('aria-expanded') === 'true');
    expect(header).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '+ Bloque de trabajo' }));
    expect(addBlock).toHaveBeenCalledOnce();
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la fase' }),
      { target: { value: 'Desarrollo Integraciones' } });
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase' }))
      .toHaveValue('Desarrollo Integraciones');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});
