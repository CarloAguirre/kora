import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './SidePanel.module.css';
import { CloseIcon } from '../icons/Icons';

/**
 * Diálogo deslizante desde el borde derecho, para formularios con más
 * contenido que un `Modal` centrado (equipo + tipo + líder + colaboradores).
 * Mismo mecanismo de accesibilidad que `Modal` — `<dialog>` nativo con
 * `showModal()` — sólo cambia la disposición visual, así que se mantiene
 * como componente aparte en vez de una variante de `Modal` para no arrastrar
 * ese cambio de layout a los demás diálogos de la app.
 */

export interface SidePanelProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  headerExtra?: ReactNode;
}

export function SidePanel({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  dismissible = true,
  headerExtra,
}: SidePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (dismissible) onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [dismissible, onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (!dismissible) return;
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClick={handleBackdropClick} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>

        <div className={styles.headerActions}>
          {headerExtra}
          {dismissible && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
              <CloseIcon size={18} />
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>{children}</div>

      {footer && <footer className={styles.footer}>{footer}</footer>}
    </dialog>
  );
}
