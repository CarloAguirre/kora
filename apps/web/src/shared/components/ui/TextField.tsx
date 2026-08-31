import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./TextField.module.css";

/**
 * Campo de texto con etiqueta, texto de ayuda y estado de error.
 *
 * Reenvía la `ref`, que es lo que permite usarlo con `react-hook-form` sin
 * envoltorios. El vínculo entre etiqueta, campo y mensaje de error se hace con
 * identificadores generados (`useId`) y `aria-describedby`: sin eso, un lector
 * de pantalla anuncia el campo pero no el motivo del error.
 */

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  label?: string;
  helperText?: string;
  errorText?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      helperText,
      errorText,
      iconLeft,
      iconRight,
      required,
      disabled,
      className,
      ...rest
    },
    ref,
  ) {
    const inputId = useId();
    const helperId = `${inputId}-helper`;
    const hasError = Boolean(errorText);
    const message = errorText ?? helperText;

    return (
      <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
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
            hasError ? styles.invalid : "",
            disabled ? styles.disabled : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {iconLeft && <span className={styles.adornment}>{iconLeft}</span>}

          <input
            ref={ref}
            id={inputId}
            className={styles.input}
            disabled={disabled}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? helperId : undefined}
            {...rest}
          />

          {iconRight && <span className={styles.adornment}>{iconRight}</span>}
        </div>
        {message && (
          <span
            id={helperId}
            className={[styles.helper, hasError ? styles.helperError : ""]
              .filter(Boolean)
              .join(" ")}
            // Anuncia el error en cuanto aparece, sin que la persona tenga que
            // volver a recorrer el formulario para descubrirlo.
            role={hasError ? "alert" : undefined}
          >
            {message}
          </span>
        )}
      </div>
    );
  },
);
