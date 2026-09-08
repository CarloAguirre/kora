import styles from './Switch.module.css';

/**
 * Interruptor de encendido/apagado.
 *
 * A diferencia de un checkbox de formulario, actúa en el acto: se usa donde el
 * cambio se aplica solo, sin un botón de guardar que lo acompañe. Por eso no
 * recibe `name` ni se registra en `react-hook-form` — quien lo usa decide qué
 * hacer en `onChange`, incluida una confirmación previa.
 *
 * Es un `<button role="switch">` y no un `<input type="checkbox">` porque así
 * los lectores de pantalla anuncian "activado/desactivado" en lugar de
 * "casilla marcada", que es lo que de verdad ocurre.
 */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Obligatorio: el interruptor no tiene texto propio, así que sin esto nadie
   *  que use un lector de pantalla sabría a qué fila pertenece. */
  label: string;
  disabled?: boolean;
  title?: string;
}

export function Switch({ checked, onChange, label, disabled = false, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      className={[styles.switch, checked ? styles.checked : ''].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
