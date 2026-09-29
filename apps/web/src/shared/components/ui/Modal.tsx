import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';
import { CloseIcon } from '../icons/Icons';

/**
 * Diálogo modal sobre el elemento `<dialog>` nativo.
 *
 * Usar el nativo con `showModal()` da gratis lo que una implementación propia
 * tarda semanas en hacer bien: atrapar el foco dentro del diálogo, devolverlo
 * al elemento que lo abrió al cerrar, cerrar con Escape, inertizar el resto de
 * la página para lectores de pantalla y pintar el fondo en la capa superior sin
 * pelearse con los z-index. La v1 montaba sus modales con divs y overlays
 * manuales, y por eso el foco se escapaba al tabular.
 */

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Impide cerrar con Escape o clic fuera; para operaciones en curso. */
  dismissible?: boolean;
  /** Contenido adicional junto al botón de cierre, p. ej. un contador de horas. */
  headerExtra?: ReactNode;
  /** Panel lateral (desliza desde la derecha, alto completo) en vez de diálogo centrado — para formularios largos. */
  side?: boolean;
  /** Clase extra para el `<dialog>`, p. ej. para un ancho a medida. */
  className?: string;
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
  dismissible = true,
  headerExtra,
  side = false,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Único por instancia: dos diálogos (uno abierto, otro cerrado) coexisten
  // en el DOM a la vez, y un id fijo produciría dos elementos con el mismo
  // id — HTML inválido que además confunde a qué título apunta aria-labelledby.
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

    // `cancel` cubre tanto Escape como el cierre del navegador. Se intercepta
    // para que el estado de React mande, y no quede un diálogo cerrado en el
    // DOM que React sigue creyendo abierto.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (dismissible) onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [dismissible, onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (!dismissible) return;
    // Un clic sobre el propio <dialog> (y no sobre su contenido) es un clic en
    // el fondo: el contenido está en elementos hijos.
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, wide ? styles.wide : '', side ? styles.side : '', className].filter(Boolean).join(' ')}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
    >
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
