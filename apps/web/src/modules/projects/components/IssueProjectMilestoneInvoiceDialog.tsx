import { useEffect, useState } from 'react';
import type { IssueProjectPaymentMilestoneInvoiceInput } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { FileField } from '@/shared/components/ui/FileField';
import { AlertIcon, InfoIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface IssueProjectMilestoneInvoiceDialogProps {
  open: boolean;
  milestoneName: string;
  amount: number;
  onClose: () => void;
  onConfirm: (input: IssueProjectPaymentMilestoneInvoiceInput) => Promise<void>;
  /**
   * true si este es el primer tramo de un proyecto `aprobado` — facturarlo
   * dispara Hito 0 (ver `IssueProjectPaymentMilestoneInvoiceUseCase`). Lo
   * decide quien abre el diálogo, comparando el `sortOrder` del tramo contra
   * el resto del proyecto ya cargado. Si el proyecto está `Detenido`, en
   * cambio, factura lo reactiva directamente (sin pasar por Gerencia) — el
   * checkbox de pausa no aplica ahí.
   */
  showHito0Notice?: boolean;
  showReactivationNotice?: boolean;
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
  showHito0Notice = false,
  showReactivationNotice = false,
}: IssueProjectMilestoneInvoiceDialogProps) {
  const [folio, setFolio] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [pauseForManagementApproval, setPauseForManagementApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setFolio('');
      setIssuedAt(new Date().toISOString().slice(0, 10));
      setAttachmentName(null);
      setPauseForManagementApproval(false);
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
      await onConfirm({
        folio: folio.trim(),
        issuedAt,
        attachmentName: attachmentName ?? undefined,
        ...(showHito0Notice ? { pauseForManagementApproval } : {}),
      });
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

      {showHito0Notice && (
        <div className={styles.hito0Box}>
          <div className={styles.hito0Text}>
            <InfoIcon size={16} className={styles.hito0Icon} />
            <span>Este es el primer tramo del proyecto. Al registrar la factura, el proyecto se activará automáticamente.</span>
          </div>
          <label className={styles.hito0Check}>
            <input
              type="checkbox"
              checked={pauseForManagementApproval}
              onChange={(e) => setPauseForManagementApproval(e.target.checked)}
            />
            Dejar en espera de aprobación de Gerencia
          </label>
        </div>
      )}

      {showReactivationNotice && (
        <div className={styles.hito0Box}>
          <div className={styles.hito0Text}>
            <InfoIcon size={16} className={styles.hito0Icon} />
            <span>Este proyecto está Detenido. Al registrar la factura, se reactivará a Activo.</span>
          </div>
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
