import { useEffect, useState } from 'react';
import styles from './DeliveryModal.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';

export interface ExecutionSegmentModalValues {
  teamId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export const EMPTY_EXECUTION_SEGMENT_MODAL_VALUES: ExecutionSegmentModalValues = {
  teamId: '',
  name: '',
  startDate: '',
  endDate: '',
};

export interface ExecutionSegmentModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Equipos ya asignados al proyecto (no el catálogo completo) — mismo criterio que `DeliveryModal`. */
  teamOptions: Array<{ value: string; label: string }>;
  initialValues: ExecutionSegmentModalValues;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (values: ExecutionSegmentModalValues) => void;
}

/**
 * Modal "Nuevo tiempo de ejecución" / "Editar tiempo de ejecución" — un tramo
 * de trabajo de un equipo dentro de una fase, con su propio rango de fechas.
 * Alimenta las barras del Roadmap (vista semanal/días) — ver
 * `projectModuleSegmentSchema`. Mismos campos y validación que el prototipo
 * HTML de referencia.
 */
export function ExecutionSegmentModal({
  open,
  mode,
  teamOptions,
  initialValues,
  submitting,
  onCancel,
  onConfirm,
}: ExecutionSegmentModalProps) {
  const [values, setValues] = useState<ExecutionSegmentModalValues>(initialValues);

  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  const canSubmit = Boolean(values.teamId && values.name.trim() && values.startDate && values.endDate && values.startDate <= values.endDate);

  return (
    <Modal
      open={open}
      title={mode === 'edit' ? 'Editar tiempo de ejecución' : 'Nuevo tiempo de ejecución'}
      description="Cuándo trabaja cada equipo en esta Fase/Módulo. Alimenta el Roadmap (vista semanal, tipo carta Gantt)."
      onClose={onCancel}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(values)} disabled={!canSubmit} loading={submitting} loadingText="Guardando…">
            Guardar
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Select
          label="Equipo"
          placeholder="Selecciona un equipo"
          options={teamOptions}
          value={values.teamId}
          onChange={(event) => setValues((prev) => ({ ...prev, teamId: event.target.value }))}
        />
        <TextField
          label="Nombre del tramo"
          placeholder="Ej. UX research, UI diseño, Front-Back"
          value={values.name}
          onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
        />
        <div className={styles.row}>
          <TextField
            label="Fecha inicio"
            type="date"
            value={values.startDate}
            onChange={(event) => setValues((prev) => ({ ...prev, startDate: event.target.value }))}
          />
          <TextField
            label="Fecha fin"
            type="date"
            value={values.endDate}
            onChange={(event) => setValues((prev) => ({ ...prev, endDate: event.target.value }))}
          />
        </div>
      </div>
    </Modal>
  );
}
