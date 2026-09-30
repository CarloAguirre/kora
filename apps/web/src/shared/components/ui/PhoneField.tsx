import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import styles from './PhoneField.module.css';

export interface PhoneDialCode {
  readonly code: string;
  readonly country: string;
}

/** Chile primero (es el caso por defecto); el resto, los países con los que más se trabaja. */
export const PHONE_DIAL_CODES: readonly PhoneDialCode[] = [
  { code: '+56', country: 'Chile' },
  { code: '+54', country: 'Argentina' },
  { code: '+591', country: 'Bolivia' },
  { code: '+55', country: 'Brasil' },
  { code: '+57', country: 'Colombia' },
  { code: '+506', country: 'Costa Rica' },
  { code: '+593', country: 'Ecuador' },
  { code: '+34', country: 'España' },
  { code: '+1', country: 'Estados Unidos / Canadá' },
  { code: '+52', country: 'México' },
  { code: '+507', country: 'Panamá' },
  { code: '+595', country: 'Paraguay' },
  { code: '+51', country: 'Perú' },
  { code: '+598', country: 'Uruguay' },
  { code: '+58', country: 'Venezuela' },
];

const DEFAULT_DIAL_CODE = '+56';

// Del más largo al más corto: así "+591…" se reconoce como Bolivia y no como
// "+59" + resto, y "+1…" no se come a nadie que empiece igual.
const CODES_BY_LENGTH = [...PHONE_DIAL_CODES].sort((a, b) => b.code.length - a.code.length);

/**
 * Separa "+56 912345678" en código y número. Un teléfono guardado sin código
 * (datos antiguos) devuelve `code: null` y el número intacto.
 */
function parsePhone(value: string): { code: string | null; number: string } {
  const match = CODES_BY_LENGTH.find(({ code }) => value.startsWith(code));
  if (!match) return { code: null, number: value };
  return { code: match.code, number: value.slice(match.code.length).replace(/^ /, '') };
}

export interface PhoneFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'value' | 'onChange'> {
  label?: string;
  errorText?: string;
  /** Teléfono completo, con el código incluido ("+56 912345678"). */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Teléfono con el código de país al lado — un `<select>` fusionado con el
 * input, igual que `MoneyField` con la moneda.
 *
 * Se guarda como un solo string ("+56 912345678") porque así lo persiste la
 * API; el componente solo lo parte para editarlo. Un número vacío se emite
 * como `''` (no como "+56 "), para no guardar teléfonos que son solo código.
 */
export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(function PhoneField(
  { label, errorText, value, onChange, className, disabled, required, ...rest },
  ref,
) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const hasError = Boolean(errorText);

  const parsed = parsePhone(value ?? '');
  // Con el número vacío el valor emitido es `''` y no lleva el código, así que
  // el código elegido se recuerda aquí para no perderlo antes de escribir.
  const [pendingCode, setPendingCode] = useState(parsed.code ?? DEFAULT_DIAL_CODE);
  const code = parsed.code ?? pendingCode;

  const emit = (nextCode: string, nextNumber: string) => {
    onChange(nextNumber.trim() ? `${nextCode} ${nextNumber}` : '');
  };

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
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
        className={[styles.field, hasError ? styles.invalid : '', disabled ? styles.disabled : '']
          .filter(Boolean)
          .join(' ')}
      >
        <select
          className={styles.dialCode}
          value={code}
          disabled={disabled}
          onChange={(event) => {
            setPendingCode(event.target.value);
            emit(event.target.value, parsed.number);
          }}
          aria-label={label ? `Código de país de ${label}` : 'Código de país'}
        >
          {PHONE_DIAL_CODES.map((option) => (
            <option key={option.code} value={option.code} title={option.country}>
              {option.code}
            </option>
          ))}
        </select>
        <span className={styles.divider} aria-hidden="true" />
        <input
          ref={ref}
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className={styles.input}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={errorText ? helperId : undefined}
          value={parsed.number}
          onChange={(event) => emit(code, event.target.value)}
          {...rest}
        />
      </div>
      {errorText && (
        <span id={helperId} className={styles.helperError} role="alert">
          {errorText}
        </span>
      )}
    </div>
  );
});
