import { useEffect, useState } from 'react';
import type { MarkProjectPaymentMilestonePaidInput } from '@kora/contracts';
import styles from './SupportPlanActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { FileField } from '@/shared/components/ui/FileField';
import { AlertIcon, InfoIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface MarkProjectMilestonePaidDialogProps {
  open: boolean;
  milestoneName: string;
  onClose: () => void;
  onConfirm: (input: MarkProjectPaymentMilestonePaidInput) => Promise<void>;
  /**
   * true si este es el primer tramo de un proyecto `aprobado`/`no iniciado` —
   * pagarlo dispara Hito 0 (ver `MarkProjectPaymentMilestonePaidUseCase`).
   * Lo decide quien abre el diálogo, comparando el `sortOrder` del tramo
   * contra el resto del proyecto ya cargado.
   */
  showHito0Notice?: boolean;
}

/**
 * Copia de `MarkSupportInvoicePaidDialog`, con dos diferencias propias de
 * proyectos: adjunto de comprobante (el de soporte no lo pide) y el aviso de
 * Hito 0 con la opción de pausar la activación automática.
 */
export function MarkProjectMilestonePaidDialog({
  open,
  milestoneName,
  onClose,
  onConfirm,
  showHito0Notice = false,
}: MarkProjectMilestonePaidDialogProps) {
  const [paidAt, setPaidAt] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [pauseForManagementApproval, setPauseForManagementApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setPaidAt(new Date().toISOString().slice(0, 10));
      setAttachmentName(null);
      setPauseForManagementApproval(false);
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
      await onConfirm({
        paidAt,
        attachmentName: attachmentName ?? undefined,
        ...(showHito0Notice ? { pauseForManagementApproval } : {}),
      });
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
      description={milestoneName}
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
      <div className={styles.field}>
        <FileField
          label="Adjuntar comprobante (opcional)"
          fileName={attachmentName}
          onChange={setAttachmentName}
          accept="application/pdf"
        />
      </div>

      {showHito0Notice && (
        <div className={styles.hito0Box}>
          <div className={styles.hito0Text}>
            <InfoIcon size={16} className={styles.hito0Icon} />
            <span>Este es el primer tramo del proyecto. Al registrar el pago, el proyecto se activará automáticamente.</span>
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

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
