import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuotationWeekInput } from './QuotationWeekInput';

describe('QuotationWeekInput', () => {
  it('permite reemplazar 5 por 1,5 con coma, sin guardar valores intermedios', () => {
    const onCommit = vi.fn().mockReturnValue(true);
    render(<QuotationWeekInput label="Duración" value={5} min={0.5} onCommit={onCommit}/>);
    const input = screen.getByRole('textbox', { name: 'Duración' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '1,' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '1,5' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(1.5);
    expect(input).toHaveValue('1,5');
  });
  it('deshace semanas inválidas y valores que el validador de capacidad rechaza', () => {
    const onCommit = vi.fn().mockReturnValue(false);
    render(<QuotationWeekInput label="Duración" value={5} min={0.5} onCommit={onCommit}/>);
    const input = screen.getByRole('textbox', { name: 'Duración' });
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('5');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(input, { target: { value: '1,3' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('5');
  });
  it('responde a flechas con saltos de 0,5 y no persiste si no cambió', () => {
    const onCommit = vi.fn().mockReturnValue(true);
    render(<QuotationWeekInput label="Inicio" value={2} min={1} onCommit={onCommit}/>);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Inicio' }), { key: 'ArrowUp' });
    expect(onCommit).toHaveBeenCalledWith(2.5);
  });
});