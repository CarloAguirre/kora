import { useEffect, useState } from 'react';
import type { MarkSupportInvoicePaidInput } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface MarkSupportInvoicePaidDialogProps {
  open: boolean;
  folio: string;
  onClose: () => void;
  onConfirm: (input: MarkSupportInvoicePaidInput) => Promise<void>;
}

export function MarkSupportInvoicePaidDialog({ open, folio, onClose, onConfirm }: MarkSupportInvoicePaidDialogProps) {
  const [paidAt, setPaidAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setPaidAt(new Date().toISOString().slice(0, 10));
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!paidAt) {
      setError('Ingresa la fecha de pago.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm({ paidAt });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo registrar el pago. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Marcar como pagado"
      description={`Factura ${folio}.`}
      onClose={onClose}
      dismissible={!running}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void handleConfirm()} loading={running} loadingText="Guardando…">
            Guardar
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <TextField label="Fecha de pago" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} autoFocus />
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
