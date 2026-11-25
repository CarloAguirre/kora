import { Button } from '@/shared/components/ui/Button';
import styles from './QuotationDraftSaveBar.module.css';

/**
 * Acciones del borrador: visibles solamente con modificaciones pendientes.
 * Se mantiene dentro de la página para anclarse al scroll propio de Kora,
 * sin tapar el menú lateral ni alterar el layout compartido.
 */
export function QuotationDraftSaveBar({
  visible, dirty, saving, fromAi, onDiscard, onSave,
}: {
  visible?: boolean;
  dirty: boolean;
  saving: boolean;
  fromAi: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!(visible ?? dirty)) return null;

  return (
    <section className={styles.bar} aria-label="Cambios de cotización sin guardar">
      <div className={styles.message}>
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.copy}>
          <strong>{fromAi ? 'Ajustando la propuesta del agente IA' : 'Editando cotización'}</strong>
          <span>{dirty ? 'Guarda para que los cambios queden en esta versión.' : 'No hay cambios pendientes.'}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="outline" size="sm" disabled={saving} onClick={onDiscard}>
          Descartar cambios
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} loading={saving} onClick={onSave}>
          Guardar ajustes
        </Button>
      </div>
    </section>
  );
}
