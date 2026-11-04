import { useState } from 'react';
import type { ProjectDetail, ProjectModule, ProjectModuleSegment, ProjectModuleDelivery } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import styles from './NewWorkBlockModal.module.css';

export interface WorkBlockFormInput {
  teamId: string;
  name: string;
  startDate: string;
  endDate: string;
  estimatedHours: number;
  closingDelivery: { name: string; description?: string } | null;
}

export interface NewWorkBlockModalProps {
  mode?: 'create' | 'edit';
  initialSegment?: ProjectModuleSegment;
  initialDelivery?: ProjectModuleDelivery | null;
  project: ProjectDetail;
  module: ProjectModule;
  teamOptions: ReadonlyArray<{ value: string; label: string }>;
  initialTeamId?: string;
  initialName?: string;
  initialEstimatedHours?: number | null;
  initialStartDate?: string;
  initialEndDate?: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (input: WorkBlockFormInput) => void;
}

/** El formulario crea el bloque y, si se solicita, su entrega en una sola transacción.
 * Las HH pertenecen al bloque, no se imputan al avance ni al consumo real de la fase. */
export function NewWorkBlockModal({
  project, module, teamOptions, initialTeamId, initialName = '', initialEstimatedHours,
  initialStartDate, initialEndDate, initialSegment, initialDelivery,
  mode = 'create', submitting, onCancel, onConfirm,
}: NewWorkBlockModalProps) {
  const [teamId, setTeamId] = useState(initialSegment?.teamId || initialTeamId || teamOptions[0]?.value || '');
  const [name, setName] = useState(initialSegment?.name ?? initialName);
  const [startDate, setStartDate] = useState(() => {
    if (initialSegment) return initialSegment.startDate;
    if (initialStartDate) return initialStartDate;
    const now = new Date();
    // Fecha del usuario (no ISO UTC): evita que se adelante/atrase un día en Chile.
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')].join('-');
  });
  const [endDate, setEndDate] = useState(initialSegment?.endDate ?? initialEndDate ?? '');
  const [hours, setHours] = useState(initialSegment?.estimatedHours != null
    ? String(initialSegment.estimatedHours) : initialEstimatedHours == null ? '' : String(initialEstimatedHours));
  const [withoutDelivery, setWithoutDelivery] = useState(mode === 'edit' && !initialDelivery);
  const [deliveryName, setDeliveryName] = useState(initialDelivery?.name ?? '');
  const [deliveryDescription, setDeliveryDescription] = useState(initialDelivery?.description ?? '');

  // Al terminar de crear una fase, el refetch puede seguir en curso.
  // Para la descripción usamos la posición siguiente sin inventar una fase persistida.
  const existingPhaseIndex = project.modules.findIndex((entry) => entry.id === module.id);
  const phaseNumber = existingPhaseIndex >= 0 ? existingPhaseIndex + 1 : project.modules.length + 1;
  const team = project.teams.find((entry) => entry.teamId === teamId);
  const priorBlocks = project.modules.flatMap((entry) => entry.segments)
    .filter((segment) => segment.teamId === teamId && segment.id !== initialSegment?.id);
  const alreadyAllocated = priorBlocks.reduce((sum, segment) => sum + (segment.estimatedHours ?? 0), 0);
  const missingEstimates = priorBlocks.some((segment) => segment.estimatedHours === null);
  const budget = team?.assignedHours ?? null;
  const available = budget == null ? null : Math.max(0, budget - alreadyAllocated);
  const numericHours = Number(hours);
  const validHours = hours.trim() !== '' && Number.isFinite(numericHours) &&
    numericHours > 0 && numericHours <= 1_000_000;
  const valid = Boolean(teamId && name.trim() && name.length <= 300 && startDate && endDate &&
    startDate <= endDate && validHours && (withoutDelivery || deliveryName.trim()) &&
    deliveryName.length <= 300 && deliveryDescription.length <= 2000);

  const submit = () => {
    if (!valid) return;
    onConfirm({
      teamId,
      name: name.trim(),
      startDate,
      endDate,
      estimatedHours: numericHours,
      closingDelivery: withoutDelivery ? null : {
        name: deliveryName.trim(),
        ...(deliveryDescription.trim() ? { description: deliveryDescription.trim() } : {}),
      },
    });
  };

  return <Modal open title={mode === 'edit' ? 'Editar bloque de trabajo' : 'Nuevo bloque de trabajo'}
    description={'Fase ' + phaseNumber + ': ' + module.name +
      '. Un bloque es el periodo en que un equipo trabaja en esta fase, y cierra con una entrega.'}
    onClose={onCancel} dismissible={!submitting}
    footer={<div className={styles.footer}>
      <Button variant="outline" disabled={submitting} onClick={onCancel}>Cancelar</Button>
      <Button disabled={!valid} loading={submitting} onClick={submit}>
        {mode === 'edit' ? 'Guardar cambios' : 'Crear bloque de trabajo'}
      </Button>
    </div>}>
    <div className={styles.form}>
      <Select label="Equipo" required value={teamId}
        placeholder="Seleccionar equipo..."
        options={teamOptions}
        onChange={(event) => setTeamId(event.target.value)} />
      <TextField label="Nombre del bloque" required maxLength={300}
        placeholder="Ej. Diseño de flujos y pantallas"
        value={name} onChange={(event) => setName(event.target.value)} />
      <div className={styles.dates}>
        <TextField label="Fecha de inicio" required type="date" value={startDate}
          onChange={(event) => setStartDate(event.target.value)} />
        <TextField label="Fecha de fin" required type="date" min={startDate || undefined}
          value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </div>
      <TextField label="HH estimadas" required type="number" min="0.01"
        step="0.01" placeholder="Ej. 60" value={hours}
        onChange={(event) => setHours(event.target.value)} />
      {budget === null ? <p className={styles.hint}>
        Este equipo aún no tiene HH asignadas para comparar su disponibilidad.
      </p> : <div className={styles.capacity} role="status">
        {team?.teamName ?? 'Equipo'}: {budget} HH asignadas, {alreadyAllocated}
        {missingEstimates ? ' HH conocidas en otros bloques (existen bloques sin HH definidas)' :
          ' HH ya en otros bloques'},
        {' '}{available} disponibles.
        {(available !== null && (available === 0 || (validHours && numericHours > available))) &&
          ' Este equipo no tiene capacidad suficiente: revisa sus HH en Equipos asignados.'}
      </div>}
      <section className={styles.delivery}>
        <h3>Entrega de cierre</h3>
        <p>Marca el término del bloque. Si necesitas otra entrega, crea otro bloque.</p>
        <div className={withoutDelivery ? styles.hiddenDelivery : styles.deliveryFields}>
          <TextField label="Nombre de la entrega" required={!withoutDelivery} maxLength={300}
            placeholder="Ej. Pantalla de colaborador mejorada"
            value={deliveryName} onChange={(event) => setDeliveryName(event.target.value)} />
          <div className={styles.description}>
            <label htmlFor="work-block-delivery-description">Descripción</label>
            <textarea id="work-block-delivery-description" rows={3} maxLength={2000}
              placeholder="Qué incluye esta entrega"
              value={deliveryDescription}
              onChange={(event) => setDeliveryDescription(event.target.value)} />
          </div>
          <small>Fecha de la entrega: la fecha de fin del bloque.</small>
        </div>
        <label className={styles.noDelivery}>
          <input type="checkbox" checked={withoutDelivery}
            onChange={(event) => setWithoutDelivery(event.target.checked)} />
          Este bloque no tiene entrega: lo cierra el líder manualmente
        </label>
      </section>
    </div>
  </Modal>;
}
