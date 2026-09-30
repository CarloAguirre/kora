import { useEffect, useState } from 'react';
import {
  PROJECT_PAYMENT_STATUSES,
  PROJECT_PAYMENT_STATUS_LABELS,
  type ProjectPaymentMilestone,
  type ProjectPaymentStatus,
  type UpdateProjectPaymentMilestoneInput,
} from '@kora/contracts';
import styles from './EditProjectMilestoneDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

interface Draft {
  name: string;
  percent: string;
  amount: string;
  sortOrder: string;
  status: ProjectPaymentStatus;
  invoiceNumber: string;
  issuedAt: string;
  paidAt: string;
}

function toDraft(milestone: ProjectPaymentMilestone): Draft {
  return {
    name: milestone.name,
    percent: milestone.percent != null ? String(milestone.percent) : '',
    amount: String(milestone.amount),
    sortOrder: String(milestone.sortOrder),
    status: milestone.status,
    invoiceNumber: milestone.invoiceNumber ?? '',
    issuedAt: milestone.issuedAt ?? '',
    paidAt: milestone.paidAt ?? '',
  };
}

const STATUS_OPTIONS = PROJECT_PAYMENT_STATUSES.map((status) => ({ value: status, label: PROJECT_PAYMENT_STATUS_LABELS[status] }));

export interface EditProjectMilestoneDialogProps {
  /** `null` = cerrado. */
  milestone: ProjectPaymentMilestone | null;
  onClose: () => void;
  onConfirm: (input: UpdateProjectPaymentMilestoneInput) => Promise<void>;
}

/**
 * Edición completa de un tramo de pago — cronograma (nombre, %, monto, orden)
 * y también estado, folio y fechas, como corrección manual. Cambiar el estado
 * acá NO dispara Hito 0 (eso sigue siendo "Subir factura"). Lo usan la pestaña
 * Extras del proyecto y la tabla de Facturación.
 */
export function EditProjectMilestoneDialog({ milestone, onClose, onConfirm }: EditProjectMilestoneDialogProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (milestone) {
      setDraft(toDraft(milestone));
      setError(null);
    }
  }, [milestone]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleConfirm = async () => {
    if (!draft) return;
    if (!draft.name.trim() || draft.amount === '') {
      setError('Ingresa al menos el nombre y el monto del tramo.');
      return;
    }
    if (draft.status !== 'pending' && (!draft.invoiceNumber.trim() || !draft.issuedAt)) {
      setError('Un tramo facturado o pagado necesita folio y fecha de emisión.');
      return;
    }
    if (draft.status === 'paid' && !draft.paidAt) {
      setError('Ingresa la fecha de pago.');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      await onConfirm({
        name: draft.name.trim(),
        percent: draft.percent === '' ? null : Number(draft.percent),
        amount: Number(draft.amount),
        sortOrder: draft.sortOrder === '' ? undefined : Number(draft.sortOrder),
        status: draft.status,
        invoiceNumber: draft.status === 'pending' ? null : draft.invoiceNumber.trim(),
        issuedAt: draft.status === 'pending' ? null : draft.issuedAt,
        paidAt: draft.status === 'paid' ? draft.paidAt : null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo guardar el tramo. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={milestone !== null}
      title="Editar tramo"
      description={milestone?.name}
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
      {draft && (
        <div className={styles.grid}>
          <TextField className={styles.full} label="Nombre" value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          <TextField
            label="Porcentaje (opcional)"
            type="number"
            min={0}
            max={100}
            value={draft.percent}
            onChange={(e) => set('percent', e.target.value)}
          />
          <TextField label="Monto (UF)" type="number" min={0} value={draft.amount} onChange={(e) => set('amount', e.target.value)} />
          <TextField label="Orden" type="number" min={0} value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          <Select
            label="Estado"
            options={STATUS_OPTIONS}
            value={draft.status}
            onChange={(e) => set('status', e.target.value as ProjectPaymentStatus)}
          />
          {draft.status !== 'pending' && (
            <>
              <TextField label="N° de documento (folio)" value={draft.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} />
              <TextField label="Fecha de emisión" type="date" value={draft.issuedAt} onChange={(e) => set('issuedAt', e.target.value)} />
            </>
          )}
          {draft.status === 'paid' && (
            <TextField label="Fecha de pago" type="date" value={draft.paidAt} onChange={(e) => set('paidAt', e.target.value)} />
          )}
        </div>
      )}

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
