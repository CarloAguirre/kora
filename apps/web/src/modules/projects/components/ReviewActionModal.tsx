import { useEffect, useState } from 'react';
import styles from './TeamLeaderProjectView.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';

export type ReviewAction = 'approve' | 'reject' | 'revert';

export interface ReviewActionModalProps {
  open: boolean;
  action: ReviewAction;
  title: string;
  /** Filas de resumen de solo lectura — nombre, colaborador, módulo, fecha, etc. */
  summary: ReadonlyArray<{ label: string; value: string }>;
  submitting?: boolean;
  onCancel: () => void;
  /** `reason` solo aplica a `action === 'reject'`. */
  onConfirm: (reason?: string) => void;
}

const CONFIRM_LABEL: Record<ReviewAction, string> = {
  approve: 'Aprobar',
  reject: 'Rechazar',
  revert: 'Revertir a en revisión',
};

/**
 * Modal compartido para aprobar, rechazar o revertir la decisión sobre una
 * tarea o entrega ya enviada por el colaborador — mismo modal para ambas
 * entidades (ver `TeamTasksCard`/`TeamDeliveriesCard`), igual criterio que el
 * prototipo de referencia ("Revisar"). Rechazar exige un motivo.
 */
export function ReviewActionModal({ open, action, title, summary, submitting, onCancel, onConfirm }: ReviewActionModalProps) {
  const [reason, setReason] = useState('');
  const [showReasonError, setShowReasonError] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setShowReasonError(false);
    }
  }, [open]);

  const onSubmit = () => {
    if (action === 'reject' && !reason.trim()) {
      setShowReasonError(true);
      return;
    }
    onConfirm(action === 'reject' ? reason.trim() : undefined);
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant={action === 'reject' ? 'danger' : 'primary'}
            onClick={onSubmit}
            loading={submitting}
            loadingText="Guardando…"
          >
            {CONFIRM_LABEL[action]}
          </Button>
        </>
      }
    >
      <div className={styles.taskForm}>
        <div className={styles.reviewSummary}>
          {summary.map((row) => (
            <div key={row.label} className={styles.reviewRow}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>

        {action === 'reject' && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="review-reject-reason">
              Motivo del rechazo
            </label>
            <textarea
              id="review-reject-reason"
              className={styles.textarea}
              placeholder="Explica qué falta o qué hay que corregir"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setShowReasonError(false);
              }}
            />
            {showReasonError && <p className={styles.modalError}>Escribe el motivo del rechazo antes de continuar.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
