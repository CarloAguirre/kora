import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Combobox.module.css';
import { ChevronDownIcon, SearchIcon } from '../icons/Icons';

/**
 * Desplegable con búsqueda de una sola selección — a diferencia de `Select`
 * (nativo, listas cortas) o `MultiSelect` (varias opciones con "Aplicar"),
 * este es un autocompletar: se escribe para filtrar y un clic selecciona y
 * cierra de inmediato. Mismo patrón que el buscador de cliente de la v1
 * (`NuevoProyectoDesarrollo`), para listas largas de una sola elección.
 */

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
}

export interface ComboboxProps {
  label?: string;
  placeholder?: string;
  options: readonly ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  errorText?: string;
}

interface PanelPosition {
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
  readonly top?: number;
  readonly bottom?: number;
}

const PANEL_MAX_HEIGHT = 260;
const PANEL_GAP = 4; // var(--kora-space-1)
const VIEWPORT_MARGIN = 8;

export function Combobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  emptyMessage = 'Sin resultados.',
  className,
  disabled = false,
  required = false,
  errorText,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  // El panel se dibuja en un portal con `position: fixed` — como `absolute`
  // dentro del campo, un ancestro con `overflow: auto/hidden` (p. ej. la card
  // del equipo asignado) lo recortaba. Mismo patrón que el calendario de
  // `TextField`: se porta dentro del `<dialog>` abierto si lo hay, para heredar
  // su top layer.
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);

  const updatePanelPosition = () => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_MARGIN;
    // Si no cabe completo abajo y arriba hay más espacio, se abre hacia arriba.
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;
    setPanelPosition({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + PANEL_GAP }
        : { top: rect.bottom + PANEL_GAP }),
    });
  };

  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };

    const handleReposition = () => updatePanelPosition();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open]);

  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase('es-CL').includes(query.trim().toLocaleLowerCase('es-CL')),
  );

  const hasError = Boolean(errorText);
  const helperId = `${inputId}-helper`;

  const select = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div
        ref={fieldRef}
        className={[
          styles.field,
          open ? styles.fieldOpen : '',
          disabled ? styles.fieldDisabled : '',
          hasError ? styles.fieldInvalid : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <SearchIcon size={16} className={styles.searchIcon} />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          className={styles.input}
          placeholder={placeholder}
          aria-invalid={hasError || undefined}
          aria-describedby={errorText ? helperId : undefined}
          value={open ? query : selectedLabel}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery('');
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className={styles.chevronButton}
          tabIndex={-1}
          disabled={disabled}
          aria-label="Mostrar opciones"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDownIcon size={16} className={styles.chevron} />
        </button>
      </div>

      {open && !disabled && panelPosition && createPortal(
        <div
          ref={panelRef}
          className={styles.panel}
          style={panelPosition}
          role="listbox"
          // Evita que el input pierda el foco al hacer clic en el panel (que ya
          // no es descendiente del campo).
          onMouseDown={(event) => event.preventDefault()}
        >
          {filteredOptions.length === 0 ? (
            <p className={styles.emptyState}>{emptyMessage}</p>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={[styles.option, option.value === value ? styles.optionSelected : ''].filter(Boolean).join(' ')}
                onClick={() => select(option.value)}
              >
                {option.label}
              </button>
            ))
          )}
        </div>,
        fieldRef.current?.closest('dialog') ?? document.body,
      )}

      {errorText && (
        <span id={helperId} className={[styles.helper, styles.helperError].join(' ')} role="alert">
          {errorText}
        </span>
      )}
    </div>
  );
}
