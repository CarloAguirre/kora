import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SubmitBlockers } from './SubmitBlockers';

describe('SubmitBlockers', () => {
  it('no muestra nada si no falta nada', () => {
    const { container } = render(<SubmitBlockers items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explica qué falta en cada registro y lleva al registro al hacer clic', () => {
    const onSelect = vi.fn();
    render(<SubmitBlockers items={[
      { key: 'b1', title: 'Gold Fields - AurelIA - Monitoreo de aire', message: 'Selecciona tu tarea u «Otro».', onSelect },
    ]} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Para guardar, falta completar:Gold Fields - AurelIA - Monitoreo de aire: Selecciona tu tarea u «Otro».',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gold Fields - AurelIA - Monitoreo de aire' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('muestra solo el mensaje cuando el formulario tiene un único registro', () => {
    render(<SubmitBlockers items={[{ key: 'entry', message: 'Selecciona el bloque de tu equipo para este trabajo.' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Selecciona el bloque de tu equipo para este trabajo.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
