import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './DropdownMenu.module.css';

/**
 * Menú flotante genérico para acciones contextuales de una fila (aprobar,
 * rechazar, editar…) — mismo patrón de apertura/cierre que `Combobox`
 * (clic afuera o Escape cierra), pero sin campo de texto: es una lista de
 * comandos, no una selección de valor.
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

export function DropdownMenu({ trigger, items, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {trigger({ onClick: () => setOpen((current) => !current), open })}

      {open && items.length > 0 && (
        <div className={[styles.panel, align === 'left' ? styles.panelLeft : styles.panelRight].join(' ')} role="menu">
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
        </div>
      )}
    </div>
  );
}
