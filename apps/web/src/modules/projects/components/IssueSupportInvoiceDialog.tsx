import { useEffect, useState } from 'react';
import type { MarkSupportInvoiceIssuedInput, SupportPlanCurrency } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { SupportInvoiceSplitFields, useSupportInvoiceSplit } from './SupportInvoiceSplitFields';

export interface IssueSupportInvoiceDialogProps {
  open: boolean;
  /** Ej. "Octubre 2026 · USD 250,00" — qué mes se está facturando. */
  description: string;
  /** Monto a facturar del período — al dividirlo, las facturas tienen que sumar exactamente esto. */
  totalAmount: number;
  currency: SupportPlanCurrency;
  onClose: () => void;
  onConfirm: (input: Omit<MarkSupportInvoiceIssuedInput, 'monthlyPeriodId'>) => Promise<void>;
}

/** Registrar la(s) factura(s) de un período — mismos campos que el formulario de `SupportPlanBillingAction`. */
export function IssueSupportInvoiceDialog({ open, description, totalAmount, currency, onClose, onConfirm }: IssueSupportInvoiceDialogProps) {
  const split = useSupportInvoiceSplit(totalAmount);
  const { reset } = split;
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      reset();
      setError(null);
    }
  }, [open, reset]);

  const handleConfirm = async () => {
    const problem = split.validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm({ invoices: split.toInput() });
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
      title={split.isSplit ? 'Registrar facturas' : 'Registrar factura'}
      description={description}
      onClose={onClose}
      wide={split.isSplit}
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
      <SupportInvoiceSplitFields split={split} currency={currency} disabled={running} />

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
