import { useEffect, useId, useRef, useState } from 'react';
import styles from './MultiSelect.module.css';
import { Button } from './Button';
import { ChevronDownIcon, SearchIcon } from '../icons/Icons';

/**
 * Desplegable de selección múltiple con casillas y búsqueda.
 *
 * A diferencia de `Select`, la elección no se aplica al marcar cada casilla:
 * queda en un borrador interno hasta que se confirma con "Aplicar" (o se
 * descarta con "Cancelar", clic afuera o Escape). Ese borrador es lo que
 * permite marcar varias opciones sin que la tabla se refiltre y salte en
 * cada clic — el mismo patrón que usaba la v1 para estos filtros.
 */

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface MultiSelectProps {
  label: string;
  placeholder: string;
  searchPlaceholder?: string;
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  className?: string;
}

export function MultiSelect({
  label,
  placeholder,
  searchPlaceholder,
  options,
  value,
  onChange,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value as string[]);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();

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

  const openPanel = () => {
    setDraft([...value]);
    setSearch('');
    setOpen(true);
  };

  const toggleOption = (optionValue: string) => {
    setDraft((current) =>
      current.includes(optionValue) ? current.filter((v) => v !== optionValue) : [...current, optionValue],
    );
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase('es-CL').includes(search.trim().toLocaleLowerCase('es-CL')),
  );

  const selectedLabels = options.filter((option) => value.includes(option.value));
  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
        ? (selectedLabels[0]?.label ?? placeholder)
        : `${selectedLabels.length} seleccionados`;

  return (
    <div ref={containerRef} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <span className={styles.label} id={triggerId}>
        {label}
      </span>

      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-labelledby={triggerId}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className={styles.summary}>{summary}</span>
        <ChevronDownIcon className={styles.chevron} size={16} />
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label={`Opciones de ${label}`}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Buscar opciones de {label}</span>
            <button type="button" className={styles.clearLink} onClick={() => setDraft([])}>
              Limpiar
            </button>
          </div>

          <div className={styles.searchField}>
            <SearchIcon size={14} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder={searchPlaceholder ?? `Buscar ${label.toLocaleLowerCase('es-CL')}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.optionList} role="group" aria-label={label}>
            {filteredOptions.length === 0 ? (
              <p className={styles.emptyState}>Sin resultados.</p>
            ) : (
              filteredOptions.map((option) => (
                <label key={option.value} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={draft.includes(option.value)}
                    onChange={() => toggleOption(option.value)}
                  />
                  {option.label}
                </label>
              ))
            )}
          </div>

          <div className={styles.panelFooter}>
            <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="secondary" size="sm" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
