import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './DropdownMenu.module.css';

/**
 * Menú flotante genérico para acciones contextuales de una fila (aprobar,
 * rechazar, editar…) — mismo patrón de apertura/cierre que `Combobox`
 * (clic afuera o Escape cierra), pero sin campo de texto: es una lista de
 * comandos, no una selección de valor.
 *
 * El panel se pinta en un portal a `document.body`, posicionado por
 * coordenadas (`position: fixed`) — igual que el calendario de `TextField`.
 * Sin esto, cualquier ancestro con `overflow` propio (p. ej. el contenedor
 * con scroll horizontal de `DataTable`) recorta el panel en vez de dejarlo
 * flotar sobre el resto de la página.
 */

export interface DropdownMenuItem {
  key: string;
  label: string;
  tone?: 'default' | 'success' | 'danger';
  onSelect: () => void;
  disabled?: boolean;
  /** Símbolo a la izquierda del texto (p.ej. el marcador de una entrega en el Roadmap). */
  icon?: ReactNode;
  /** Texto secundario a la derecha (p.ej. el estado del ítem). */
  hint?: string;
  /** Marca el ítem como el seleccionado actualmente. */
  active?: boolean;
}

export interface DropdownMenuProps {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode;
  items: readonly DropdownMenuItem[];
  align?: 'left' | 'right';
  className?: string;
}

interface PanelPosition {
  top: number;
  left: number;
}

/** Distancia mínima entre el panel y el borde de la ventana. */
const VIEWPORT_MARGIN = 8;

export function DropdownMenu({ trigger, items, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** `useLayoutEffect`: el panel se pinta primero oculto para medirlo y se ubica antes del
      paint. Se ajusta a la ventana — un disparador pegado al borde derecho o inferior (p.ej. un
      marcador al final del Roadmap) dejaba el panel cortado fuera de la pantalla. */
  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const anchor = containerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const gap = 4;
      const preferredLeft = align === 'right' ? anchor.right - panel.width : anchor.left;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, window.innerWidth - VIEWPORT_MARGIN - panel.width));
      const fitsBelow = anchor.bottom + gap + panel.height <= window.innerHeight - VIEWPORT_MARGIN;
      const fitsAbove = anchor.top - gap - panel.height >= VIEWPORT_MARGIN;
      const top = !fitsBelow && fitsAbove ? anchor.top - gap - panel.height : anchor.bottom + gap;
      setPosition({ top, left });
    };
    updatePosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      setPosition(null);
    };
  }, [open, align]);

  return (
    <div ref={containerRef} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {trigger({ onClick: () => setOpen((current) => !current), open })}

      {open &&
        items.length > 0 &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? undefined : 'hidden',
            }}
            role="menu"
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={[
                  styles.item,
                  item.tone === 'success' ? styles.itemSuccess : '',
                  item.tone === 'danger' ? styles.itemDanger : '',
                  item.active ? styles.itemActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={item.active || undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                <span className={styles.itemLabel}>{item.label}</span>
                {item.hint && <span className={styles.itemHint}>{item.hint}</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
