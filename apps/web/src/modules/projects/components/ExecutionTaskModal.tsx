import { useState } from 'react';
import type { ProjectDetail, ProjectModuleTask } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useUpdateProjectModuleTask } from '../api/projects.queries';
import styles from './ExecutionTaskModal.module.css';

/** Las tareas siguen guardando el vínculo al bloque en la descripción.
 * No introducir una FK ficticia ni borrar la referencia a la cotización. */
const BLOCK_PREFIX = 'Bloque de trabajo: ';
const sourceAndText = (description: string | null) => {
  const lines = (description ?? '').split('\n');
  const marker = lines.filter((line) => line.startsWith('Referencia cotización '));
  const content = lines.filter((line) => !line.startsWith(BLOCK_PREFIX) &&
    !line.startsWith('Referencia cotización ')).join('\n').trim();
  const blockLine = lines.find((line) => line.startsWith(BLOCK_PREFIX)) ?? '';
  const blockId = blockLine.match(/ · ID ([a-f0-9-]{36})$/i)?.[1] ?? '';
  return { marker, content, blockId, blockLine };
};

export function ExecutionTaskModal({
  project, moduleId, task, onClose, onDuplicate, allowedTeamId,
}: {
  project: ProjectDetail;
  moduleId: string;
  task: ProjectModuleTask;
  onClose: () => void;
  onDuplicate: () => void;
  allowedTeamId?: string;
}) {
  const update = useUpdateProjectModuleTask();
  const toast = useToast();
  const original = sourceAndText(task.description);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(original.content);
  const [assignee, setAssignee] = useState(task.assigneeUserId ?? '');
  const [teamId, setTeamId] = useState(task.teamId ?? '');
  const [blockId, setBlockId] = useState(task.segmentId ?? original.blockId);
  const [status, setStatus] = useState(task.status);
  const [estimatedHours, setEstimatedHours] = useState(String(task.estimatedHours ?? ''));
  const [startDate, setStartDate] = useState(task.startDate);
  const [date, setDate] = useState(task.date);

  const module = project.modules.find((item) => item.id === moduleId);
  const members = project.members.filter((member) => member.userStatus === 'active' && !member.blockedAt &&
    (!allowedTeamId || member.teamId === allowedTeamId));
  const assigneeOptions = members.map((member) => ({
    value: member.teamId + ':' + member.userId,
    label: member.fullName + ' · ' + member.teamName,
  }));
  // No perder la identidad histórica de una persona que ya dejó el proyecto.
  const selectedAssignment = assignee && teamId ? teamId + ':' + assignee : '';
  if (selectedAssignment && !assigneeOptions.some((entry) => entry.value === selectedAssignment)) {
    assigneeOptions.unshift({ value: selectedAssignment, label: task.assigneeName ?? 'Asignación anterior' });
  }
  const blocks = module?.segments.filter((segment) => segment.teamId === teamId) ?? [];
  const chosenBlock = blocks.find((segment) => segment.id === blockId);
  const datesFitBlock = !chosenBlock ||
    (startDate >= chosenBlock.startDate && date <= chosenBlock.endDate);
  const hours = Number(estimatedHours);
  const valid = Boolean(name.trim() && Number.isFinite(hours) && hours > 0 &&
    startDate && date && startDate <= date && datesFitBlock &&
    description.length <= 1800);
  const save = async () => {
    if (!valid) {
      toast.error('Completa el título, HH y fechas válidas. Las fechas deben respetar el bloque.');
      return;
    }
    const blockLine = chosenBlock
      ? BLOCK_PREFIX + chosenBlock.name + ' · ID ' + chosenBlock.id
      : blockId ? original.blockLine : '';
    const newDescription = [...original.marker, blockLine, description.trim()].filter(Boolean).join('\n');
    if (newDescription.length > 2000) {
      toast.error('La descripción y referencias superan el máximo de 2.000 caracteres.');
      return;
    }
    try {
      await update.mutateAsync({
        projectId: project.id, moduleId, taskId: task.id,
        input: {
          name: name.trim(), description: newDescription || null,
          teamId: teamId || null, segmentId: blockId || null,
          assigneeUserId: assignee || null,
          status, estimatedHours: hours, startDate, date,
        },
      });
      toast.success('Tarea actualizada.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo editar la tarea.');
    }
  };

  return <Modal open title="Editar tarea" onClose={onClose}
    dismissible={!update.isPending}
    footer={<div className={styles.footer}>
      <button type="button" className={styles.duplicateLink}
        onClick={onDuplicate} disabled={update.isPending}>
        Duplicar para otra persona
      </button>
      <div className={styles.footerActions}>
        <Button variant="outline" disabled={update.isPending} onClick={onClose}>Cancelar</Button>
        <Button loading={update.isPending} disabled={!valid}
          onClick={() => void save()}>Guardar cambios</Button>
      </div>
    </div>}>
    <div className={styles.form}>
      <TextField label="Título de la tarea" required maxLength={300}
        value={name} onChange={(event) => setName(event.target.value)} />
      <div className={styles.textareaField}>
        <label htmlFor={'task-description-' + task.id}>Descripción</label>
        <textarea id={'task-description-' + task.id} rows={3} maxLength={1800}
          value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <Select label="Asignado a" placeholder="Sin asignar"
        value={selectedAssignment} options={assigneeOptions}
        onChange={(event) => {
          const member = members.find((item) =>
            item.teamId + ':' + item.userId === event.target.value);
          setAssignee(member?.userId ?? '');
          setTeamId(member?.teamId ?? task.teamId ?? '');
          setBlockId('');
          // Reasignar no conserva la aprobación de la persona anterior.
          if ((member?.userId ?? null) !== (task.assigneeUserId ?? null)) setStatus('todo');
        }} />
      <p className={styles.help}>Solo puedes asignar colaboradores del proyecto. Si está vacío, la tarea continúa por asignar.</p>
      <Select label="Módulo relacionado" value={moduleId} disabled
        options={[{ value: moduleId, label: module?.name ?? 'Módulo actual' }]}
        helperText="Las tareas existentes no se mueven entre módulos desde este formulario." />
      <Select label="Bloque de trabajo" value={chosenBlock?.id ?? ''}
        placeholder={blocks.length ? 'Sin bloque específico' : 'Sin bloque planificado'}
        options={blocks.map((segment) => ({
          value: segment.id,
          label: segment.name + ' (' + segment.startDate + ' – ' + segment.endDate + ')',
        }))}
        onChange={(event) => {
          setBlockId(event.target.value);
          const block = blocks.find((entry) => entry.id === event.target.value);
          if (block) { setStartDate(block.startDate); setDate(block.endDate); }
        }} />
      {original.marker.length > 0 && <p className={styles.help}>
        Viene de la cotización. Al elegir a quién se asigna pasa a Pendiente.
      </p>}
      <div className={styles.twoColumns}>
        <Select label="Estado" value={status} options={[
          { value: 'todo', label: assignee ? 'Pendiente' : 'Por asignar' },
          { value: 'in_progress', label: 'En curso' },
          { value: 'in_review', label: 'En revisión' },
          { value: 'done', label: 'Aprobada' },
        ]} onChange={(event) => setStatus(event.target.value as ProjectModuleTask['status'])} />
        <TextField label="HH estimadas" required type="number" step="0.01"
          min="0.01" value={estimatedHours}
          onChange={(event) => setEstimatedHours(event.target.value)} />
      </div>
      <div className={styles.twoColumns}>
        <TextField label="Fecha de inicio" required type="date" value={startDate}
          onChange={(event) => setStartDate(event.target.value)} />
        <TextField label="Fecha límite" required type="date" min={startDate || undefined}
          value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
      {!datesFitBlock && <p className={styles.error} role="alert">
        Las fechas de esta tarea deben quedar dentro del bloque seleccionado.
      </p>}
    </div>
  </Modal>;
}
