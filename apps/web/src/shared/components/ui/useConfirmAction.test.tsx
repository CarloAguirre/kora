import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useConfirmAction } from './useConfirmAction';

function ChainedDelete({ remove }: { remove: () => void }) {
  const { confirm, dialog } = useConfirmAction();
  const start = async () => {
    if (!await confirm({
      title: 'Eliminar bloque y tareas relacionadas',
      description: 'Primera comprobación',
      confirmLabel: 'Continuar',
      destructive: true,
    })) return;
    if (!await confirm({
      title: 'Confirmación final · Eliminar bloque',
      description: 'Segunda comprobación',
      confirmLabel: 'Sí, eliminar bloque y tareas',
      destructive: true,
    })) return;
    remove();
  };
  return <>
    <button type="button" onClick={() => void start()}>Eliminar bloque</button>
    {dialog}
  </>;
}

describe('Doble confirmación sin cancelación entre diálogos', () => {
  it('el cierre del primero no cancela ni oculta automáticamente el segundo', async () => {
    const remove = vi.fn();
    render(<ChainedDelete remove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar bloque' }));
    expect(screen.getByRole('dialog', { name: 'Eliminar bloque y tareas relacionadas' }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByRole('dialog', {
      name: 'Confirmación final · Eliminar bloque',
    })).toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();
    // Regresión: el onClose tardío del diálogo 1 no puede cerrar el diálogo 2.
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar bloque y tareas' }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  });

  it('cancelar cualquiera de las confirmaciones impide la eliminación', async () => {
    const remove = vi.fn();
    const { unmount } = render(<ChainedDelete remove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar bloque' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', {
      name: 'Eliminar bloque y tareas relacionadas',
    })).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();
    unmount();

    render(<ChainedDelete remove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar bloque' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('dialog', { name: 'Confirmación final · Eliminar bloque' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(remove).not.toHaveBeenCalled();
  });
});
