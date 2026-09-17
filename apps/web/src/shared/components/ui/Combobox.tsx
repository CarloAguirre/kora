import { useEffect, useId, useRef, useState } from 'react';
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
  const inputId = useId();

  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
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

      {open && !disabled && (
        <div className={styles.panel} role="listbox">
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
        </div>
      )}

      {errorText && (
        <span id={helperId} className={[styles.helper, styles.helperError].join(' ')} role="alert">
          {errorText}
        </span>
      )}
    </div>
  );
}
