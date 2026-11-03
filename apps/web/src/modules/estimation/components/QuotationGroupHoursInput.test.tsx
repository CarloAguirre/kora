import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuotationGroupHoursInput } from './QuotationGroupHoursInput';

describe('HH de encabezado · redistribución atómica', () => {
  it('acumula cambios sucesivos de centésimas y confirma solo el total final', () => {
    const onCommit = vi.fn();
    render(<QuotationGroupHoursInput value={40} onCommit={onCommit}
      label="HH del equipo Tech Lead"/>);
    const input = screen.getByRole('spinbutton', { name: 'HH del equipo Tech Lead' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '39.99' } });
    fireEvent.change(input, { target: { value: '39.98' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(39.98);
  });

  it('permite escribir un número completo antes de redistribuir, también con Enter', () => {
    const onCommit = vi.fn();
    render(<QuotationGroupHoursInput value={40} onCommit={onCommit}
      label="HH de fase"/>);
    const input = screen.getByRole('spinbutton', { name: 'HH de fase' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.change(input, { target: { value: '39' } });
    fireEvent.change(input, { target: { value: '39.5' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(39.5);
  });

  it('Escape cancela y dejar el campo vacío no crea un total cero accidental', () => {
    const onCommit = vi.fn();
    render(<QuotationGroupHoursInput value={40} onCommit={onCommit}
      label="HH de fase"/>);
    const input = screen.getByRole('spinbutton', { name: 'HH de fase' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(40);
  });
});
