import styles from './PillSwitcher.module.css';

export interface PillSwitcherOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface PillSwitcherProps<Value extends string> {
  readonly options: readonly PillSwitcherOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly 'aria-label': string;
}

/**
 * Selector compartido extraído del filtro de Bitácora: borde suave,
 * selección verde y accesibilidad mediante botones aria-pressed.
 * No altera SegmentedControl ni sus consumidores existentes.
 */
export function PillSwitcher<Value extends string>({
  options, value, onChange, 'aria-label': ariaLabel,
}: PillSwitcherProps<Value>) {
  return <div className={styles.group} role="group" aria-label={ariaLabel}>
    {options.map((option) =>
      <button key={option.value} type="button"
        aria-pressed={option.value === value}
        className={[styles.option, option.value === value ? styles.selected : ''].filter(Boolean).join(' ')}
        onClick={() => onChange(option.value)}>
        {option.label}
      </button>)}
  </div>;
}
