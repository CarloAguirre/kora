import { useEffect, useState } from 'react';
import type { IssueProjectPaymentMilestoneInvoiceInput } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { FileField } from '@/shared/components/ui/FileField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface IssueProjectMilestoneInvoiceDialogProps {
  open: boolean;
  milestoneName: string;
  amount: number;
  onClose: () => void;
  onConfirm: (input: IssueProjectPaymentMilestoneInvoiceInput) => Promise<void>;
}

/**
 * Copia del patrón de `IssueSupportInvoiceDialog` para un tramo de proyecto —
 * mismo criterio: Kora no emite la factura, solo registra folio y fecha.
 */
export function IssueProjectMilestoneInvoiceDialog({
  open,
  milestoneName,
  amount,
  onClose,
  onConfirm,
}: IssueProjectMilestoneInvoiceDialogProps) {
  const [folio, setFolio] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setFolio('');
      setIssuedAt(new Date().toISOString().slice(0, 10));
      setAttachmentName(null);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!folio.trim() || !issuedAt) {
      setError('Ingresa el folio y la fecha de emisión.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm({ folio: folio.trim(), issuedAt, attachmentName: attachmentName ?? undefined });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo registrar la factura. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Subir factura"
      description={`${milestoneName} · ${amount.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`}
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
        <TextField label="N° de documento (folio)" placeholder="Ej: 27846" value={folio} onChange={(e) => setFolio(e.target.value)} autoFocus />
      </div>
      <div className={styles.field}>
        <TextField label="Fecha de emisión" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
      </div>
      <div className={styles.field}>
        <FileField
          label="Adjuntar factura (PDF, opcional)"
          fileName={attachmentName}
          onChange={setAttachmentName}
          accept="application/pdf"
        />
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
