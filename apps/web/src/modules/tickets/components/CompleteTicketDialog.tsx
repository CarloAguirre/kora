import { useEffect, useState } from 'react';
import styles from './CompleteTicketDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

export interface CompleteTicketDialogProps {
  open: boolean;
  /** "Terminar Proceso" o "Marcar Terminado" — el mismo texto del botón que abrió este diálogo. */
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (resolution: string) => Promise<void>;
}

/**
 * Pide la solución justo al confirmar el paso a "Terminado" — réplica de la
 * v1: el campo de solución nunca aparece editable en la vista pasiva del
 * ticket, solo como parte de la acción de avanzarlo (ver
 * `getSupportTicketDisplayCode`/`Soporte/index.tsx` en el repo legacy). v2
 * junta "ver" y "actuar" en un solo modal, así que esto reemplaza a los dos
 * modales de transición separados de la v1 por un paso intermedio único.
 */
export function CompleteTicketDialog({ open, confirmLabel, onClose, onConfirm }: CompleteTicketDialogProps) {
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setResolution('');
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    const trimmed = resolution.trim();
    if (!trimmed) {
      setError('Describe la solución aplicada antes de continuar.');
      return;
    }

    setError(null);
    setRunning(true);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'No se pudo completar la acción. Inténtalo de nuevo.');
    } finally {
      setRunning(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Registrar solución"
      onClose={handleClose}
      dismissible={!running}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={running}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void handleConfirm()} loading={running} loadingText="Guardando…">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label className={styles.label} htmlFor="complete-ticket-resolution">
        Solución aplicada
      </label>
      <textarea
        id="complete-ticket-resolution"
        className={styles.textarea}
        value={resolution}
        placeholder="Describe la solución aplicada"
        onChange={(event) => setResolution(event.target.value)}
        autoFocus
      />

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
