import { useState } from 'react';
import styles from './ConfirmActionDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

/**
 * Confirmación de una acción con consecuencias.
 *
 * Se usa para dar de baja a alguien o para conceder acceso. La acción real
 * llega como una función que devuelve una promesa, de modo que este componente
 * no sabe qué está confirmando: solo muestra el aviso, espera la respuesta y
 * enseña el error si lo hay.
 *
 * Mantiene el diálogo abierto cuando falla —en lugar de cerrarlo y mostrar un
 * aviso suelto— porque el error suele ser accionable ("no puedes dejar el
 * sistema sin administradores") y cerrar el diálogo obligaría a repetir todo el
 * recorrido para leerlo.
 */

export interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Presenta la acción como destructiva. */
  destructive?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmActionDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setRunning(true);

    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'No se pudo completar la acción. Inténtalo de nuevo.',
      );
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
      title={title}
      onClose={handleClose}
      dismissible={!running}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={running}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            loading={running}
            loadingText="Procesando…"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.description}>{description}</p>

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
