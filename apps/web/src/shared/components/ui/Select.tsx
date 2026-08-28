import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';
import { ChevronDownIcon } from '../icons/Icons';

/**
 * Desplegable.
 *
 * Usa el `<select>` nativo a propósito. Un desplegable propio se ve más
 * moderno, pero cuesta accesibilidad de teclado, comportamiento correcto en
 * móvil y búsqueda al escribir — todo lo que el nativo trae resuelto. Para los
 * casos que necesitan búsqueda dentro de muchas opciones existe un combobox
 * aparte; para elegir entre cinco roles, esto es lo correcto.
 */

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  options: readonly SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helperText, errorText, options, placeholder, required, disabled, className, ...rest },
  ref,
) {
  const selectId = useId();
  const helperId = `${selectId}-helper`;
  const hasError = Boolean(errorText);
  const message = errorText ?? helperText;

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div
        className={[styles.field, hasError ? styles.invalid : '', disabled ? styles.disabled : '']
          .filter(Boolean)
          .join(' ')}
      >
        <select
          ref={ref}
          id={selectId}
          className={styles.select}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={message ? helperId : undefined}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDownIcon className={styles.chevron} size={16} />
      </div>

      <span
        id={helperId}
        className={[styles.helper, hasError ? styles.helperError : ''].filter(Boolean).join(' ')}
        role={hasError ? 'alert' : undefined}
      >
        {message}
      </span>
    </div>
  );
});
