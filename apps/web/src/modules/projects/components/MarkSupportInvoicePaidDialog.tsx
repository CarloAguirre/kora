import { useEffect, useState } from 'react';
import type { MarkSupportInvoicePaidInput } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface PayableSupportInvoice {
  readonly id: string;
  readonly folio: string;
  /** Ej. "100.00 UF" — para distinguir las facturas de un período dividido. */
  readonly amountLabel?: string;
}

export interface MarkSupportInvoicePaidDialogProps {
  open: boolean;
  /** Las facturas impagas entre las que elegir — con una sola, no se muestra el selector. */
  invoices: readonly PayableSupportInvoice[];
  onClose: () => void;
  onConfirm: (invoiceId: string, input: MarkSupportInvoicePaidInput) => Promise<void>;
}

/** Cada factura se paga por separado — si el total del período se dividió en varias, se elige cuál. */
export function MarkSupportInvoicePaidDialog({ open, invoices, onClose, onConfirm }: MarkSupportInvoicePaidDialogProps) {
  const [invoiceId, setInvoiceId] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const firstInvoiceId = invoices[0]?.id ?? '';

  useEffect(() => {
    if (open) {
      setInvoiceId(firstInvoiceId);
      setPaidAt(new Date().toISOString().slice(0, 10));
      setError(null);
    }
  }, [open, firstInvoiceId]);

  const handleConfirm = async () => {
    if (!invoiceId) {
      setError('Elige la factura que se pagó.');
      return;
    }
    if (!paidAt) {
      setError('Ingresa la fecha de pago.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm(invoiceId, { paidAt });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo registrar el pago. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  const hasChoice = invoices.length > 1;

  return (
    <Modal
      open={open}
      title="Marcar como pagado"
      description={hasChoice ? 'El total de este período se dividió en varias facturas.' : `Factura ${invoices[0]?.folio ?? ''}.`}
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
      {hasChoice && (
        <div className={styles.field}>
          <Select
            label="Factura"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            options={invoices.map((invoice) => ({
              value: invoice.id,
              label: invoice.amountLabel ? `Folio ${invoice.folio} · ${invoice.amountLabel}` : `Folio ${invoice.folio}`,
            }))}
          />
        </div>
      )}
      <div className={styles.field}>
        <TextField label="Fecha de pago" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} autoFocus={!hasChoice} />
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
