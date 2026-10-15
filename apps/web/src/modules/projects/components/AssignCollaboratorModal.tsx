import { useEffect, useState } from 'react';
import styles from './TeamLeaderProjectView.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';

export interface AssignCollaboratorModalProps {
  open: boolean;
  /** `true` si la entrega ya tenía un colaborador (cambia el título/label a "Reasignar"). */
  isReassign: boolean;
  summary: ReadonlyArray<{ label: string; value: string }>;
  memberOptions: ReadonlyArray<{ value: string; label: string }>;
  initialUserId: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (userId: string) => void;
}

/** Modal "Asignar colaborador" / "Reasignar" — mismo modal para alta y reasignación (ver `TeamDeliveriesCard`). */
export function AssignCollaboratorModal({
  open,
  isReassign,
  summary,
  memberOptions,
  initialUserId,
  submitting,
  onCancel,
  onConfirm,
}: AssignCollaboratorModalProps) {
  const [userId, setUserId] = useState(initialUserId);

  useEffect(() => {
    // Sin colaborador previo, el `<select>` igual muestra la primera opción por defecto del
    // navegador (no hay placeholder) — si no reflejamos eso acá, el botón queda deshabilitado
    // (`!userId`) aunque se vea una opción marcada. Lo mismo si el colaborador actual ya no se
    // ofrece (se deshabilitó): reasignar a él mismo no tendría sentido.
    const isOffered = memberOptions.some((option) => option.value === initialUserId);
    if (open) setUserId((isOffered ? initialUserId : '') || memberOptions[0]?.value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUserId]);

  return (
    <Modal
      open={open}
      title={isReassign ? 'Reasignar' : 'Asignar colaborador'}
      onClose={onCancel}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(userId)} disabled={!userId} loading={submitting} loadingText="Guardando…">
            {isReassign ? 'Reasignar' : 'Asignar'}
          </Button>
        </>
      }
    >
      <div className={styles.taskForm}>
        <div className={styles.reviewSummary}>
          {summary.map((row) => (
            <div key={row.label} className={styles.reviewRow}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>

        {memberOptions.length === 0 ? (
          <p className={styles.modalError}>
            Este equipo todavía no tiene colaboradores en el proyecto: primero hay que sumarlos al equipo del proyecto.
          </p>
        ) : (
          <Select
            label="Colaborador del equipo"
            options={memberOptions}
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
