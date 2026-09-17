import { forwardRef, useId, type ForwardedRef, type InputHTMLAttributes } from 'react';
import styles from './MoneyField.module.css';

export interface MoneyFieldCurrencyOption {
  readonly value: string;
  readonly label: string;
}

export interface MoneyFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label?: string;
  currency: string;
  onCurrencyChange: (value: string) => void;
  currencyOptions: readonly MoneyFieldCurrencyOption[];
}

function applyRef(ref: ForwardedRef<HTMLInputElement>, node: HTMLInputElement | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

/** Campo de monto con su moneda al lado — un `<select>` de moneda fusionado con el input, en vez de un `TextField` con la unidad fija en el label. */
export const MoneyField = forwardRef<HTMLInputElement, MoneyFieldProps>(function MoneyField(
  { label, currency, onCurrencyChange, currencyOptions, className, disabled, ...rest },
  ref,
) {
  const inputId = useId();

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={[styles.field, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
        <select
          className={styles.currency}
          value={currency}
          disabled={disabled}
          onChange={(event) => onCurrencyChange(event.target.value)}
          aria-label={label ? `Moneda de ${label}` : 'Moneda'}
        >
          {currencyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.divider} aria-hidden="true" />
        <input
          ref={(node) => applyRef(ref, node)}
          id={inputId}
          type="number"
          className={styles.input}
          disabled={disabled}
          {...rest}
        />
      </div>
    </div>
  );
});
