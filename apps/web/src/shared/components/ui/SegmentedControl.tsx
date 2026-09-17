import styles from './SegmentedControl.module.css';

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}

/** Selector de una sola opción entre pocas alternativas — pastillas en vez de un `<select>`, para cuando todas las opciones caben a la vista. */
export function SegmentedControl({ options, value, onChange, 'aria-label': ariaLabel }: SegmentedControlProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={[styles.option, selected ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
