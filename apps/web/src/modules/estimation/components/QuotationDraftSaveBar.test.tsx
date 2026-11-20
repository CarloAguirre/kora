import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuotationDraftSaveBar } from './QuotationDraftSaveBar';

describe('Cotización: guardado desde footer contextual', () => {
  it('no ocupa espacio ni ofrece acciones cuando no hay cambios', () => {
    const { container } = render(<QuotationDraftSaveBar
      dirty={false} saving={false} fromAi={true}
      onDiscard={vi.fn()} onSave={vi.fn()}
    />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Guardar ajustes' })).not.toBeInTheDocument();
  });

  it('muestra el footer para una edición IA y conecta ambos botones', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<QuotationDraftSaveBar
      dirty saving={false} fromAi
      onSave={onSave} onDiscard={onDiscard}
    />);
    expect(screen.getByRole('region', { name: 'Cambios de cotización sin guardar' }))
      .toBeInTheDocument();
    expect(screen.getByText('Ajustando la propuesta del agente IA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('en ajuste IA sin cambios mantiene el footer y deshabilita guardar', () => {
    render(<QuotationDraftSaveBar visible dirty={false} saving={false} fromAi
      onSave={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText('No hay cambios pendientes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeEnabled();
  });

  it('en una versión manual muestra mensaje correcto y bloquea las acciones durante guardado', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<QuotationDraftSaveBar
      dirty saving fromAi={false} onSave={onSave} onDiscard={onDiscard}
    />);
    expect(screen.getByText('Editando cotización')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
