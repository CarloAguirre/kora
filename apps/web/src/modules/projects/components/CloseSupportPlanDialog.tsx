import { useEffect, useState } from 'react';
import type { CloseSupportPlanInput } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

const CLOSE_REASON_OPTIONS = [
  { value: 'Finalizado por cliente', label: 'Finalizado por cliente' },
  { value: 'No renovado', label: 'No renovado' },
  { value: 'Cambio de plan', label: 'Cambio de plan' },
  { value: 'Otro', label: 'Otro' },
];

export interface CloseSupportPlanDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: CloseSupportPlanInput) => Promise<void>;
}

export function CloseSupportPlanDialog({ open, onClose, onConfirm }: CloseSupportPlanDialogProps) {
  const [closedAt, setClosedAt] = useState('');
  const [closeReason, setCloseReason] = useState(CLOSE_REASON_OPTIONS[0]!.value);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setClosedAt(new Date().toISOString().slice(0, 10));
      setCloseReason(CLOSE_REASON_OPTIONS[0]!.value);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!closedAt) {
      setError('Elige una fecha de cierre.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm({ closedAt, closeReason });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo cerrar el contrato. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Cerrar contrato"
      onClose={onClose}
      dismissible={!running}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void handleConfirm()} loading={running} loadingText="Cerrando…">
            Cerrar contrato
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <TextField label="Fecha de cierre" type="date" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} autoFocus />
      </div>
      <div className={styles.field}>
        <Select label="Motivo" options={CLOSE_REASON_OPTIONS} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
      </div>

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
