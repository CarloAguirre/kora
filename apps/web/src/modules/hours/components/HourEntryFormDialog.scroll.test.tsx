import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '@/shared/components/ui/Modal';
import modalStyles from '@/shared/components/ui/Modal.module.css';
import modalCss from '@/shared/components/ui/Modal.module.css?raw';
import { HourEntryFormDialog } from './HourEntryFormDialog';

// No se simulan consultas ni se envían HH; verificamos el contenedor real.
vi.mock('./DailyEntryForm', async (importOriginal) => ({
  ...await importOriginal<typeof import('./DailyEntryForm')>(),
  DailyEntryForm: () => <div>Formulario diario</div>,
}));
vi.mock('./WeeklyEntryForm', () => ({
  WeeklyEntryForm: () => <div>Formulario semanal</div>,
}));

const noop = vi.fn();

describe('Scroll vertical del modal Registrar horas', () => {
  it('activa una sola zona de desplazamiento tanto en el formulario diario como semanal', () => {
    render(<HourEntryFormDialog open entry={null} onClose={noop} onSuccess={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'Registrar horas' });
    expect(dialog).toHaveClass(modalStyles.bodyScrollOnly!);
    expect(screen.getByText('Formulario diario')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Registro semanal'));
    expect(screen.getByText('Formulario semanal')).toBeInTheDocument();
    expect(dialog).toHaveClass(modalStyles.bodyScrollOnly!);
  });

  it('no cambia el comportamiento por defecto ni los modales laterales', () => {
    const { unmount } = render(<Modal open title="Modal estándar" onClose={noop}>Contenido</Modal>);
    expect(screen.getByRole('dialog', { name: 'Modal estándar' }))
      .not.toHaveClass(modalStyles.bodyScrollOnly!);
    unmount();
    render(<Modal open side title="Drawer de gestión" onClose={noop}>Datos</Modal>);
    const drawer = screen.getByRole('dialog', { name: 'Drawer de gestión' });
    expect(drawer).not.toHaveClass(modalStyles.bodyScrollOnly!);
    expect(drawer).toHaveClass(modalStyles.side!);
  });

  it('acota el scroll al cuerpo por CSS y deja fija la cabecera sin aplicar la regla globalmente', () => {
    const dialogRule = modalCss.match(/\.dialog\.bodyScrollOnly\[open\]\s*\{([^}]+)\}/)?.[1] ?? '';
    const bodyRule = modalCss.match(/\.dialog\.bodyScrollOnly\[open\] \.body\s*\{([^}]+)\}/)?.[1] ?? '';
    const headerRule = modalCss.match(
      /\.dialog\.bodyScrollOnly\[open\] \.header,\s*\.dialog\.bodyScrollOnly\[open\] \.footer\s*\{([^}]+)\}/,
    )?.[1] ?? '';
    expect(dialogRule).toMatch(/overflow:\s*hidden\s*;/);
    expect(dialogRule).toMatch(/max-height:\s*calc\(100dvh\s*-\s*32px\)\s*;/);
    expect(bodyRule).toMatch(/min-height:\s*0\s*;/);
    expect(bodyRule).toMatch(/overflow-y:\s*auto\s*;/);
    expect(headerRule).toMatch(/flex:\s*0\s+0\s+auto\s*;/);
  });
});
