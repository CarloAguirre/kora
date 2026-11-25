import { useState } from 'react';
import {
  PROJECT_MODULE_TASK_SCOPES, PROJECT_MODULE_TASK_SCOPE_LABELS,
  type ProjectDetail, type ProjectModuleTaskScope,
} from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useCreateProjectModuleTask } from '../api/projects.queries';
import styles from './ExecutionTaskModal.module.css';

export function NewOperationalTaskModal({
  project, moduleId, initialSegmentId, onClose,
}: {
  project: ProjectDetail;
  moduleId: string;
  /** Preselección solo cuando se abrió desde el detalle de un bloque. */
  initialSegmentId?: string;
  onClose: () => void;
}) {
  const create = useCreateProjectModuleTask();
  const toast = useToast();
  const module = project.modules.find((item) => item.id === moduleId);
  const initialBlock = module?.segments.find((entry) => entry.id === initialSegmentId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState(initialBlock?.teamId ?? project.teams[0]?.teamId ?? '');
  const [assignee, setAssignee] = useState('');
  const [blockId, setBlockId] = useState(initialBlock?.id ?? '');
  const [scope, setScope] = useState<ProjectModuleTaskScope>('desarrollo');
  const [hours, setHours] = useState('');
  const [startDate, setStartDate] = useState(initialBlock?.startDate ?? '');
  const [date, setDate] = useState(initialBlock?.endDate ?? '');
  const blocks = module?.segments.filter((entry) => entry.teamId === teamId) ?? [];
  const block = blocks.find((entry) => entry.id === blockId);
  const memberOptions = project.members.filter((member) =>
    member.teamId === teamId && member.userStatus === 'active' && !member.blockedAt).map((member) => ({
    value: member.userId, label: member.fullName,
  }));
  const numericHours = Number(hours);
  const valid = Boolean(name.trim() && teamId && block && hours.trim() &&
    Number.isFinite(numericHours) && numericHours > 0 && startDate && date &&
    startDate <= date && (!block || (startDate >= block.startDate && date <= block.endDate)));

  const save = async () => {
    if (!valid) return;
    const fullDescription = [block ?
      'Bloque de trabajo: ' + block.name + ' · ID ' + block.id : '', description.trim()]
      .filter(Boolean).join('\n');
    if (fullDescription.length > 2000) {
      toast.error('La descripción excede los 2.000 caracteres.');
      return;
    }
    try {
      await create.mutateAsync({
        projectId: project.id, moduleId,
        input: {
          teamId, segmentId: blockId || null,
          name: name.trim(),
          description: fullDescription || null,
          assigneeUserId: assignee || null,
          status: 'todo',
          scope,
          estimatedHours: numericHours, startDate, date,
        },
      });
      toast.success('Tarea creada.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo crear la tarea.');
    }
  };
  return <Modal open title="Nueva tarea" onClose={onClose}
    dismissible={!create.isPending}
    footer={<div className={styles.footerActions}>
      <Button variant="outline" disabled={create.isPending} onClick={onClose}>Cancelar</Button>
      <Button disabled={!valid} loading={create.isPending}
        onClick={() => void save()}>Crear tarea</Button>
    </div>}>
    <div className={styles.form}>
      <TextField label="Título de la tarea" required maxLength={300} value={name}
        onChange={(event) => setName(event.target.value)} />
      <div className={styles.textareaField}>
        <label htmlFor="new-task-description">Descripción</label>
        <textarea id="new-task-description" rows={3} maxLength={2000} value={description}
          onChange={(event) => setDescription(event.target.value)} />
      </div>
      <Select label="Módulo relacionado" value={moduleId} disabled
        options={[{ value: moduleId, label: module?.name ?? 'Módulo' }]} />
      <Select label="Equipo" required value={teamId}
        options={project.teams.map((item) => ({ value: item.teamId, label: item.teamName }))}
        onChange={(event) => { setTeamId(event.target.value); setAssignee(''); setBlockId(''); }} />
      <Select label="Asignado a" value={assignee} placeholder="Sin asignar"
        options={memberOptions} onChange={(event) => setAssignee(event.target.value)} />
      <p className={styles.help}>Solo puedes asignar colaboradores activos del proyecto.</p>
      <Select label="Bloque de trabajo" required value={blockId}
        placeholder={blocks.length ? 'Selecciona un bloque' : 'Primero planifica un bloque'}
        options={blocks.map((item) => ({
          value: item.id, label: item.name + ' (' + item.startDate + ' – ' + item.endDate + ')',
        }))}
        onChange={(event) => {
          setBlockId(event.target.value);
          const selected = blocks.find((item) => item.id === event.target.value);
          if (selected) { setStartDate(selected.startDate); setDate(selected.endDate); }
        }} />
      <div className={styles.twoColumns}>
        <Select label="Ámbito" value={scope}
          options={PROJECT_MODULE_TASK_SCOPES.map((value) => ({
            value, label: PROJECT_MODULE_TASK_SCOPE_LABELS[value],
          }))} onChange={(event) => setScope(event.target.value as ProjectModuleTaskScope)} />
        <TextField label="HH estimadas" required type="number" min="0.01" step="0.01"
          value={hours} onChange={(event) => setHours(event.target.value)} />
      </div>
      <div className={styles.twoColumns}>
        <TextField label="Fecha de inicio" required type="date" value={startDate}
          onChange={(event) => setStartDate(event.target.value)} />
        <TextField label="Fecha límite" required type="date" value={date} min={startDate || undefined}
          onChange={(event) => setDate(event.target.value)} />
      </div>
      {blocks.length === 0 && <p role="alert" className={styles.error}>
        Primero crea un bloque de trabajo para este equipo en la fase seleccionada.
      </p>}
      {block && !(startDate >= block.startDate && date <= block.endDate) &&
        <p role="alert" className={styles.error}>
          Las fechas deben quedar dentro del bloque seleccionado.
        </p>}
    </div>
  </Modal>;
}
