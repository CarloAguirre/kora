import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Modal } from '@/shared/components/ui/Modal';
import modalStyles from '@/shared/components/ui/Modal.module.css';
import { HourEntryFormDialog } from './HourEntryFormDialog';

// Vitest/JSDOM puede transformar import.meta.url en una URL que no es file:.
// Se lee la fuente CSS real desde la raíz de apps/web o del monorepo.
const modalCssPath = [
  resolve(process.cwd(), 'src/shared/components/ui/Modal.module.css'),
  resolve(process.cwd(), 'apps/web/src/shared/components/ui/Modal.module.css'),
].find((path) => existsSync(path));
if (!modalCssPath) throw new Error('No se encontró Modal.module.css para el test.');
const modalCss = readFileSync(modalCssPath, 'utf8');
const hourDialogSource = readFileSync(resolve(modalCssPath, '../../../../modules/hours/components/HourEntryFormDialog.tsx'), 'utf8');
const globalCss = readFileSync(resolve(modalCssPath, '../../../../styles/global.css'), 'utf8');

// No se simulan consultas ni se envían HH; verificamos el contenedor real.
vi.mock('./DailyEntryForm', async (importOriginal) => ({
  ...await importOriginal<typeof import('./DailyEntryForm')>(),
  DailyEntryForm: ({ initialTask }: { initialTask?: { taskId: string; taskTitle: string } }) =>
    <div>Formulario diario{initialTask && <span>Tarea preseleccionada: {initialTask.taskTitle} ({initialTask.taskId})</span>}</div>,
}));
vi.mock('./WeeklyEntryForm', () => ({
  WeeklyEntryForm: () => <div>Formulario semanal</div>,
}));

const noop = vi.fn();

describe('Scroll vertical del modal Registrar horas', () => {
  it('limita tambien la edicion y el detalle al scroll del cuerpo', () => {
    for (const title of ['Editar registro de horas', 'Detalle del registro']) {
      expect(hourDialogSource).toMatch(new RegExp(`<Modal[^>]*title="${title}"[^>]*bodyScrollOnly[^>]*>`));
    }
  });

  it('bloquea la raiz sin convertir body en un contenedor que desplace el sidebar sticky', () => {
    expect(globalCss).toMatch(/html:has\(dialog\[open\]\)\s*\{\s*overflow:\s*hidden;/);
    expect(globalCss).not.toMatch(/body:has\(dialog\[open\]\)/);
  });
  it('activa una sola zona de desplazamiento tanto en el formulario diario como semanal', () => {
    render(<HourEntryFormDialog open entry={null} onClose={noop} onSuccess={noop} />);
    const dialog = screen.getByRole('dialog', { name: 'Registrar horas' });
    expect(dialog).toHaveClass(modalStyles.bodyScrollOnly!);
    expect(screen.getByText('Formulario diario')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Registro semanal'));
    expect(screen.getByText('Formulario semanal')).toBeInTheDocument();
    expect(dialog).toHaveClass(modalStyles.bodyScrollOnly!);
  });

  it('preselecciona la tarea cuando el registro se inicia desde completar', () => {
    render(<HourEntryFormDialog open entry={null} onClose={noop} onSuccess={noop}
      initialTask={{ projectId: 'p-1', moduleId: 'm-1', taskId: 'task-1', taskTitle: 'Diseño' }} />);
    const dialog = screen.getByRole('dialog', { name: 'Registrar horas' });
    expect(within(dialog).getByText('Tarea preseleccionada: Diseño (task-1)')).toBeInTheDocument();
    expect(within(dialog).queryByText('Registro semanal')).not.toBeInTheDocument();
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
