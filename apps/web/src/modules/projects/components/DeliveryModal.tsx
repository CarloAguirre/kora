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
  /** Tiempo de ejecución de la fase — vacío ⇔ sin tramo. En borradores puede ser una clave local (ver `segmentOptions`). */
  segmentId: string;
}

export const EMPTY_DELIVERY_MODAL_VALUES: DeliveryModalValues = {
  teamId: '',
  name: '',
  description: '',
  estimatedDate: '',
  segmentId: '',
};

/** Tiempo de ejecución elegible para una entrega — se filtra por el equipo responsable elegido. */
export interface DeliverySegmentOption {
  value: string;
  label: string;
  teamId: string;
}

const formatSegmentDate = (isoDate: string) => isoDate.split('-').reverse().join('-');

/** "UI diseño (03-11-2026 → 14-11-2026)" — `value` es el id del tramo o, en borradores, `draftSegmentKey`. */
export function toDeliverySegmentOption(
  value: string,
  segment: { teamId: string; name: string; startDate: string; endDate: string },
): DeliverySegmentOption {
  return {
    value,
    teamId: segment.teamId,
    label: `${segment.name} (${formatSegmentDate(segment.startDate)} → ${formatSegmentDate(segment.endDate)})`,
  };
}

/**
 * Clave de un tramo que todavía no existe (fase en borrador): la entrega lo referencia con ella y
 * `resolveDraftSegmentId` la traduce al id real una vez creados los tramos de la fase.
 */
export const draftSegmentKey = (localId: number) => `draft:${localId}`;

export function resolveDraftSegmentId(segmentId: string, idsByDraftKey: ReadonlyMap<string, string>): string | undefined {
  if (!segmentId) return undefined;
  return segmentId.startsWith('draft:') ? idsByDraftKey.get(segmentId) : segmentId;
}

export interface DeliveryModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Equipos ya asignados al proyecto (no el catálogo completo) — mismo criterio que "Equipos e involucrados". */
  teamOptions: Array<{ value: string; label: string }>;
  /** Tiempos de ejecución de la fase de la entrega. */
  segmentOptions?: DeliverySegmentOption[];
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
export function DeliveryModal({
  open,
  mode,
  teamOptions,
  segmentOptions = [],
  initialValues,
  submitting,
  onCancel,
  onConfirm,
}: DeliveryModalProps) {
  const [values, setValues] = useState<DeliveryModalValues>(initialValues);

  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  const canSubmit = Boolean(values.teamId && values.name.trim() && values.estimatedDate);
  const teamSegmentOptions = segmentOptions.filter((segment) => segment.teamId === values.teamId);

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
          // Los tramos son de un equipo: si cambia el equipo, el elegido deja de aplicar.
          onChange={(event) => setValues((prev) => ({ ...prev, teamId: event.target.value, segmentId: '' }))}
        />
        <Select
          label="Tiempo de ejecución"
          placeholder={
            !values.teamId
              ? 'Primero selecciona un equipo'
              : teamSegmentOptions.length > 0
                ? 'Sin tiempo de ejecución'
                : 'La fase no tiene tiempos de ejecución de este equipo'
          }
          options={teamSegmentOptions.map(({ value, label }) => ({ value, label }))}
          value={values.segmentId}
          disabled={teamSegmentOptions.length === 0}
          onChange={(event) => setValues((prev) => ({ ...prev, segmentId: event.target.value }))}
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
