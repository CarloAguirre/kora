import { Button } from '@/shared/components/ui/Button';
import styles from './QuotationDraftSaveBar.module.css';

/**
 * Acciones del borrador: visibles solamente con modificaciones pendientes.
 * Se mantiene dentro de la página para anclarse al scroll propio de Kora,
 * sin tapar el menú lateral ni alterar el layout compartido.
 */
export function QuotationDraftSaveBar({
  dirty, saving, fromAi, onDiscard, onSave,
}: {
  dirty: boolean;
  saving: boolean;
  fromAi: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!dirty) return null;

  return (
    <section className={styles.bar} aria-label="Cambios de cotización sin guardar">
      <div className={styles.message}>
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.copy}>
          <strong>{fromAi ? 'Ajustando la propuesta del agente IA' : 'Editando cotización'}</strong>
          <span>Guarda para que los cambios queden en esta versión.</span>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="outline" size="sm" disabled={saving} onClick={onDiscard}>
          Descartar cambios
        </Button>
        <Button variant="primary" size="sm" loading={saving} onClick={onSave}>
          Guardar ajustes
        </Button>
      </div>
    </section>
  );
}
