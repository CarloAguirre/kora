import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const { error } = useToast();
  return <button type="button" onClick={() => error('Aviso de prueba')}>Probar aviso</button>;
}
const dialogs: HTMLDialogElement[] = [];
afterEach(async () => {
  await act(async () => {
    dialogs.forEach((dialog) => dialog.remove());
    dialogs.length = 0;
  });
});

function openDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.appendChild(dialog);
  dialogs.push(dialog);
  return dialog;
}

describe('ToastProvider y modal nativo top-layer', () => {
  it('mueve el aviso al diálogo abierto y permite cerrarlo por encima del modal', async () => {
    const dialog = openDialog();
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Probar aviso' }));
    await waitFor(() => {
      expect(dialog.querySelector('[aria-live="polite"]')).not.toBeNull();
      expect(dialog.textContent).toContain('Aviso de prueba');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText('Aviso de prueba')).not.toBeInTheDocument();
  });

  it('al cerrar el diálogo devuelve los avisos al documento', async () => {
    const dialog = openDialog();
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Probar aviso' }));
    await waitFor(() => expect(dialog.textContent).toContain('Aviso de prueba'));
    await act(async () => { dialog.removeAttribute('open'); });
    await waitFor(() => expect(dialog.querySelector('aside')).toBeNull());
    expect(document.body.textContent).toContain('Aviso de prueba');
    expect(screen.getByRole('button', { name: 'Cerrar aviso' })).toBeInTheDocument();
  });

  it('elige el último diálogo activo para que el snackbar no quede detrás de un segundo modal', async () => {
    const first = openDialog();
    const second = openDialog();
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Probar aviso' }));
    await waitFor(() => expect(second.textContent).toContain('Aviso de prueba'));
    expect(first.querySelector('aside')).toBeNull();
  });
});
