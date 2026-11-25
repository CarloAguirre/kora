import { AlertIcon } from '@/shared/components/icons/Icons';
import styles from './HourEntryFormDialog.module.css';

export interface SubmitBlocker {
  key: string;
  /** Registro al que pertenece (en formularios con varios registros). */
  title?: string;
  message: string;
  /** Lleva al registro (lo expande y lo muestra). */
  onSelect?: () => void;
}

/**
 * Explica, junto al botón de guardar, por qué está deshabilitado. Sin esto el
 * motivo solo aparecía al hacer clic, y un botón deshabilitado no se puede
 * clicar: la persona no sabía qué le faltaba (p. ej. el bloque o la tarea de
 * un registro colapsado).
 */
export function SubmitBlockers({ items }: { items: readonly SubmitBlocker[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.submitBlockers} role="status" aria-live="polite">
      <AlertIcon size={16} />
      <div>
        <strong>Para guardar, falta completar:</strong>
        <ul className={styles.submitBlockersList}>
          {items.map((item) => (
            <li key={item.key}>
              {item.title && (item.onSelect
                ? <button type="button" className={styles.submitBlockersLink} onClick={item.onSelect}>{item.title}</button>
                : <strong>{item.title}</strong>)}
              {item.title && ': '}
              {item.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
