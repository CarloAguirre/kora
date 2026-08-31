import { useState } from 'react';
import type { ClientSummary } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useChangeClientStatus } from '../api/clients.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import styles from '@/shared/components/ui/ConfirmActionDialog.module.css';

export interface DeactivateClientDialogProps {
  open: boolean;
  client: ClientSummary | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * Confirmación de desactivación, con el segundo paso de la cascada de proyectos.
 *
 * El primer intento va SIN confirmar. Si el servidor responde que hay
 * proyectos activos (`CLIENT_DEACTIVATION_REQUIRES_CONFIRMATION`), el diálogo
 * muestra cuántos y ofrece un segundo botón para confirmar la cascada — es la
 * pieza de interfaz que la v1 nunca tuvo: allí el trigger finalizaba los
 * proyectos sin que nadie lo viera venir.
 */
export function DeactivateClientDialog({
  open,
  client,
  onClose,
  onSuccess,
}: DeactivateClientDialogProps) {
  const changeStatus = useChangeClientStatus();
  const [error, setError] = useState<string | null>(null);
  const [affectedProjects, setAffectedProjects] = useState<number | null>(null);

  const attempt = async (confirmCascade: boolean) => {
    if (!client) return;
    setError(null);

    try {
      const result = await changeStatus.mutateAsync({
        clientId: client.id,
        input: { status: 'inactive', confirmProjectCascade: confirmCascade },
      });
      onSuccess(
        result.affectedProjects > 0
          ? `${client.companyName} fue desactivado. Se finalizaron ${result.affectedProjects} proyecto(s).`
          : `${client.companyName} fue desactivado.`,
      );
      handleClose();
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'CLIENT_DEACTIVATION_REQUIRES_CONFIRMATION') {
        const count = caught.payload.details?.activeProjectCount;
        setAffectedProjects(typeof count === 'number' ? count : 0);
        return;
      }
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'No se pudo desactivar el cliente. Inténtalo de nuevo.',
      );
    }
  };

  const handleClose = () => {
    setError(null);
    setAffectedProjects(null);
    onClose();
  };

  if (!client) return null;

  return (
    <Modal
      open={open}
      title="Desactivar cliente"
      onClose={handleClose}
      dismissible={!changeStatus.isPending}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={changeStatus.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => void attempt(affectedProjects !== null)}
            loading={changeStatus.isPending}
            loadingText="Procesando…"
          >
            {affectedProjects !== null ? 'Sí, finalizar y desactivar' : 'Desactivar'}
          </Button>
        </>
      }
    >
      {affectedProjects === null ? (
        <p>
          {client.companyName} dejará de aparecer como cliente activo. Sus proyectos, tickets y
          facturación históricos se conservan íntegros.
        </p>
      ) : (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>
            {client.companyName} tiene <b>{affectedProjects}</b> proyecto(s) activo(s).
            Desactivarlo los finalizará también a ellos. ¿Confirmas que quieres continuar?
          </span>
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
