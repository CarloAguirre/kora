import type { QuotationVersion } from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import styles from './QuotationAiReviewBanner.module.css';

/**
 * Revisión humana de la propuesta IA: NO equivale a aprobación del cliente.
 * Las decisiones de aceptar y guardar las resuelve la página y se validan en API.
 */
export function QuotationAiReviewBanner({
  version, adjusting, editable, dirty, saving, accepting, acceptedBy,
  onAdjust, onAccept, onDiscard, onSave,
}: {
  version: QuotationVersion;
  adjusting: boolean;
  editable: boolean;
  dirty: boolean;
  saving: boolean;
  accepting: boolean;
  acceptedBy?: string;
  onAdjust: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (version.origin !== 'ai') return null;
  if (version.aiReviewStatus === 'accepted') {
    return (
      <p className={styles.accepted} role="status">
        <Badge tone="success">
          Propuesta del agente IA, aceptada{acceptedBy ? ' por ' + acceptedBy : ''}.
        </Badge>
        <span className={styles.srOnly}> La aprobación del cliente se registra aparte.</span>
      </p>
    );
  }
  if (version.aiReviewStatus !== 'pending') return null;

  const files = version.draft.aiPoc?.proposal.documentsAnalyzed;
  const answers = version.draft.aiPoc?.answers.length;
  return (
    <section className={styles.banner} aria-label="Revisión de propuesta IA">
      {adjusting ? (
        <>
          <p className={styles.description}>
            <strong>✦ Estás ajustando la propuesta del agente IA.</strong> Edita lo que
            necesites. Tus cambios quedan al presionar Guardar ajustes; si los descartas,
            vuelves a la propuesta guardada.
          </p>
          <div className={styles.actions}>
            <Button variant="outline" size="sm" disabled={!editable || saving}
              onClick={onDiscard}>Descartar cambios</Button>
            <Button variant="secondary" size="sm" disabled={!editable || !dirty}
              loading={saving} onClick={onSave}>Guardar ajustes</Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.description}>
            <strong>✦ Propuesta generada por el agente IA</strong>
            {typeof files === 'number' ? ' a partir de ' + files + ' documento' +
              (files === 1 ? '' : 's') : ''}
            {typeof answers === 'number' ? ' y ' + answers + ' respuesta' +
              (answers === 1 ? '' : 's') + ' del cuestionario' : ''}.
            El agente no define el valor HH comercial. ¿Cómo quieres seguir?
          </p>
          <div className={styles.actions}>
            <Button variant="outline" size="sm" disabled={!editable || accepting}
              onClick={onAdjust}>Ajustar antes de aceptar</Button>
            <Button variant="secondary" size="sm" disabled={!editable}
              loading={accepting} onClick={onAccept}>Usar tal cual</Button>
          </div>
        </>
      )}
    </section>
  );
}
