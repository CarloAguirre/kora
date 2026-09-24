import { useEffect, useState } from 'react';
import styles from './DeliveryModal.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';

export interface DeliveryModalValues {
  teamId: string;
  name: string;
  description: string;
  estimatedDate: string;
}

export const EMPTY_DELIVERY_MODAL_VALUES: DeliveryModalValues = {
  teamId: '',
  name: '',
  description: '',
  estimatedDate: '',
};

export interface DeliveryModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Equipos ya asignados al proyecto (no el catálogo completo) — mismo criterio que "Equipos e involucrados". */
  teamOptions: Array<{ value: string; label: string }>;
  initialValues: DeliveryModalValues;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (values: DeliveryModalValues) => void;
}

/**
 * Modal "Nueva entrega" / "Editar entrega" — mismos campos y validación que el
 * prototipo HTML (equipo, nombre y fecha objetivo obligatorios; descripción
 * opcional), usado tanto al crear un proyecto (`NewProjectPage`) como al
 * editar uno ya existente (`EditProjectDialog`).
 */
export function DeliveryModal({ open, mode, teamOptions, initialValues, submitting, onCancel, onConfirm }: DeliveryModalProps) {
  const [values, setValues] = useState<DeliveryModalValues>(initialValues);

  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  const canSubmit = Boolean(values.teamId && values.name.trim() && values.estimatedDate);

  return (
    <Modal
      open={open}
      title={mode === 'edit' ? 'Editar entrega' : 'Nueva entrega'}
      description='Crea automáticamente un hito "Entrega a cliente" en estado Planificada.'
      onClose={onCancel}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(values)}
            disabled={!canSubmit}
            loading={submitting}
            loadingText="Guardando…"
          >
            Guardar entrega
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Select
          label="Equipo responsable"
          placeholder="Selecciona un equipo"
          options={teamOptions}
          value={values.teamId}
          onChange={(event) => setValues((prev) => ({ ...prev, teamId: event.target.value }))}
        />
        <TextField
          label="Nombre de la entrega"
          placeholder="Ej. Entrega 1: Login funcional"
          value={values.name}
          onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
        />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="delivery-modal-description">
            Descripción
          </label>
          <textarea
            id="delivery-modal-description"
            className={styles.textarea}
            placeholder="Qué incluye esta entrega"
            value={values.description}
            onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>
        <TextField
          label="Fecha objetivo"
          type="date"
          value={values.estimatedDate}
          onChange={(event) => setValues((prev) => ({ ...prev, estimatedDate: event.target.value }))}
        />
      </div>
    </Modal>
  );
}
