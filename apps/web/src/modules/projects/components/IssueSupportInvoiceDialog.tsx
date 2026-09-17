import { useEffect, useState } from 'react';
import type { MarkSupportInvoiceIssuedInput, SupportPlanCurrency } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { FileField } from '@/shared/components/ui/FileField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { formatMoney } from '@/shared/lib/format-money';

export interface IssueSupportInvoiceDialogProps {
  open: boolean;
  amountUf: number;
  currency: SupportPlanCurrency;
  onClose: () => void;
  onConfirm: (input: MarkSupportInvoiceIssuedInput) => Promise<void>;
}

/**
 * Kora no emite la factura: este diálogo registra que ya se emitió (folio y
 * fecha) — mismo criterio que el prototipo de referencia. Solo se guarda el
 * nombre del archivo adjunto: la v2 todavía no tiene almacenamiento de
 * archivos (tarea transversal pendiente).
 */
export function IssueSupportInvoiceDialog({ open, amountUf, currency, onClose, onConfirm }: IssueSupportInvoiceDialogProps) {
  const [folio, setFolio] = useState('');
  const [invoicedAt, setInvoicedAt] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setFolio('');
      setInvoicedAt(new Date().toISOString().slice(0, 10));
      setAttachmentName(null);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!folio.trim() || !invoicedAt) {
      setError('Ingresa el folio y la fecha de emisión.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm({ folio: folio.trim(), invoicedAt, attachmentName: attachmentName ?? undefined });
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
      title="Marcar como facturado"
      description={`Monto a facturar este período: ${formatMoney(amountUf, currency)}.`}
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
        <TextField label="Fecha de emisión" type="date" value={invoicedAt} onChange={(e) => setInvoicedAt(e.target.value)} />
      </div>
      <div className={styles.field}>
        <FileField
          label="Adjuntar PDF (opcional)"
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
