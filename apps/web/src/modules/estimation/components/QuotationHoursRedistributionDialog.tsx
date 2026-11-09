import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import type { QuotationRedistributionPreview } from '../lib/quotation-hour-redistribution-preview';
import styles from './QuotationHoursRedistributionDialog.module.css';

const hh = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function QuotationHoursRedistributionDialog({
  preview, teamName, phaseName, onCancel, onApply,
}: {
  preview: QuotationRedistributionPreview | null;
  teamName: string;
  phaseName?: string;
  onCancel: () => void;
  onApply: () => void;
}) {
  if (!preview) return null;
  const modified = preview.changes.filter((row) => row.delta !== 0).length;
  return (
    <Modal open title="Repartir horas entre tareas"
      className={styles.dialog} onClose={onCancel}
      footer={<div className={styles.actions}>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onApply}>Aplicar cambios</Button>
      </div>}>
      <p className={styles.description}>
        {preview.delta >= 0 ? 'Agregar ' : 'Descontar '}
        <strong>{hh(Math.abs(preview.delta))} HH</strong> en
        {' '}<strong>{teamName}</strong>{phaseName ? ' · ' + phaseName : ' · todas sus fases'}.
        Las diferencias se reparten entre las tareas no fijas, sin modificar su evidencia IA.
      </p>
      {preview.capacityChange && (
        <p className={styles.description} aria-label="Cambio de jornada y dedicación">
          Capacidad: <strong>{hh(preview.capacityChange.beforeHoursPerWeek)} → {hh(preview.capacityChange.afterHoursPerWeek)} HH/sem</strong>
          {' · '}Dedicación: <strong>{hh(preview.capacityChange.beforeDedicationPercent)}% → {hh(preview.capacityChange.afterDedicationPercent)}%</strong>.
          Se ajustan proporcionalmente las HH de las actividades existentes; no se inventan HH para completar semanas.
        </p>
      )}
      <div className={styles.summary}>
        <span>Antes: <strong>{hh(preview.before)} HH</strong></span>
        <span>Después: <strong>{hh(preview.after)} HH</strong></span>
        <span>{modified} {modified === 1 ? 'asignación modificada' : 'asignaciones modificadas'}</span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr><th>Tarea / perfil</th><th>Antes</th><th>Después</th><th>Diferencia</th></tr></thead>
          <tbody>{preview.changes.map((row) => (
            <tr key={row.wbs + ':' + row.role}>
              <td>
                <strong>{row.name}</strong>
                <small>{row.role} · {row.wbs}{row.fixed ? ' · Fija (sin cambios)' : ''}</small>
              </td>
              <td>{hh(row.before)}</td>
              <td><strong>{hh(row.after)}</strong></td>
              <td className={row.delta === 0 ? styles.unchanged : styles.changed}>
                {row.delta > 0 ? '+' : ''}{hh(row.delta)}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className={styles.footnote}>Ninguna tarea se elimina automáticamente. Al cancelar se conserva la cotización sin cambios.</p>
    </Modal>
  );
}
