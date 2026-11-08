import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PillSwitcher } from './PillSwitcher';

const choices = [
  { value: 'view', label: 'Ver' },
  { value: 'plan', label: 'Planificar' },
] as const;

describe('PillSwitcher compartido · Bitácora/Roadmap', () => {
  it('comparte botones con aria-pressed y selección lime del mismo componente', () => {
    const onChange = vi.fn();
    render(<PillSwitcher options={choices} value="view"
      onChange={onChange} aria-label="Modo del Roadmap" />);
    const group = screen.getByRole('group', { name: 'Modo del Roadmap' });
    const view = within(group).getByRole('button', { name: 'Ver' });
    const plan = within(group).getByRole('button', { name: 'Planificar' });
    expect(view).toHaveAttribute('aria-pressed', 'true');
    expect(view.className).toContain('selected');
    expect(plan).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(plan);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('plan');
  });

  it('permite tres opciones sin modificar el patrón de Bitácora', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'all', label: 'Todos' },
      { value: 'incidents', label: 'Incidentes' },
      { value: 'work', label: 'Entregas y tareas' },
    ] as const;
    render(<PillSwitcher options={options} value="all"
      onChange={onChange} aria-label="Filtrar por tipo" />);
    const group = screen.getByRole('group', { name: 'Filtrar por tipo' });
    expect(within(group).getByRole('button', { name: 'Todos' }))
      .toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: 'Incidentes' }));
    expect(onChange).toHaveBeenCalledWith('incidents');
  });
});
