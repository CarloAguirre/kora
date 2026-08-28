import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

/**
 * Botón del sistema de diseño.
 *
 * Las variantes son exactamente las de la v1 (`KoraButton`), para que la
 * interfaz no cambie de aspecto. Lo que cambia es de dónde salen los estilos:
 * un CSS Module propio en lugar de clases globales que cualquier otra pantalla
 * podía pisar sin querer.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'outlineDark'
  | 'tertiary'
  | 'danger'
  | 'dangerOutline'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText,
    iconLeft,
    iconRight,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      // `aria-busy` permite a un lector de pantalla anunciar que la acción está
      // en curso, algo que el spinner visual por sí solo no comunica.
      aria-busy={loading || undefined}
      className={[styles.button, styles[variant], size !== 'md' ? styles[size] : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          {loadingText ?? children}
        </>
      ) : (
        <>
          {iconLeft}
          {children}
          {iconRight}
        </>
      )}
    </button>
  );
});
