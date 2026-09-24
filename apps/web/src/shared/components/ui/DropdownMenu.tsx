import { useEffect, useRef, useState, type ReactNode } from 'react';
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
}

export interface DropdownMenuProps {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode;
  items: readonly DropdownMenuItem[];
  align?: 'left' | 'right';
  className?: string;
}

interface PanelPosition {
  top: number;
  left?: number;
  right?: number;
}

export function DropdownMenu({ trigger, items, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 4;
      setPosition(
        align === 'right'
          ? { top: rect.bottom + gap, right: window.innerWidth - rect.right }
          : { top: rect.bottom + gap, left: rect.left },
      );
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
    };
  }, [open, align]);

  return (
    <div ref={containerRef} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {trigger({ onClick: () => setOpen((current) => !current), open })}

      {open &&
        items.length > 0 &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{ position: 'fixed', top: position.top, left: position.left, right: position.right }}
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
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
