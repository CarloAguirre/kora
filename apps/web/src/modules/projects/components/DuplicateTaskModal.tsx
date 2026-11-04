import { useState } from 'react';
import type { ProjectDetail, ProjectModuleTask } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useCreateProjectModuleTask } from '../api/projects.queries';
import styles from './ExecutionTaskModal.module.css';

function nextName(name: string, names: readonly string[]) {
  const match = name.match(/^(.*?) \((\d+)\)$/);
  const base = match ? match[1]! : name;
  let next = match ? Number(match[2]) + 1 : 2;
  while (names.includes(base + ' (' + next + ')')) next++;
  return (base + ' (' + next + ')').slice(0, 300);
}

/** Conserva alcance, módulo, equipo, bloque y fechas. Solo se elige a la otra
 * persona, el título y sus HH. La nueva tarea pasa a Pendiente, sin copiar
 * aprobación ni consumo de horas de la tarea original. */
export function DuplicateTaskModal({
  project, moduleId, task, onClose,
}: {
  project: ProjectDetail;
  moduleId: string;
  task: ProjectModuleTask;
  onClose: () => void;
}) {
  const create = useCreateProjectModuleTask();
  const toast = useToast();
  const module = project.modules.find((item) => item.id === moduleId);
  const [name, setName] = useState(() => nextName(task.name, module?.tasks.map((t) => t.name) ?? []));
  const [assigneeValue, setAssigneeValue] = useState('');
  const [hours, setHours] = useState(String(task.estimatedHours ?? ''));
  const members = project.members.filter((member) => member.userStatus === 'active' &&
    (!task.teamId || member.teamId === task.teamId));
  const selected = members.find((member) =>
    member.teamId + ':' + member.userId === assigneeValue);
  const effort = Number(hours);
  const valid = Boolean(selected && selected.userId !== task.assigneeUserId &&
    name.trim() && Number.isFinite(effort) && effort > 0 &&
    task.startDate && task.date && task.startDate <= task.date);

  const submit = async () => {
    if (!valid || !selected) return;
    try {
      await create.mutateAsync({
        projectId: project.id, moduleId,
        input: {
          name: name.trim(),
          description: task.description,
          teamId: selected.teamId, assigneeUserId: selected.userId,
          scope: task.scope, status: 'todo',
          estimatedHours: effort, startDate: task.startDate, date: task.date,
        },
      });
      toast.success('Tarea duplicada y asignada a otra persona.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo duplicar la tarea.');
    }
  };

  return <Modal open title="Duplicar para otra persona"
    onClose={onClose} dismissible={!create.isPending}
    footer={<div className={styles.footerActions}>
      <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
      <Button disabled={!valid} loading={create.isPending}
        onClick={() => void submit()}>Duplicar tarea</Button>
    </div>}>
    <div className={styles.form}>
      <p className={styles.help}>Se copian la descripción, el módulo, el bloque de trabajo y las fechas
        ({task.startDate} → {task.date}). Solo elige a quién asignarla y sus horas.</p>
      <TextField label="Título de la tarea" required maxLength={300}
        value={name} onChange={(event) => setName(event.target.value)} />
      <div className={styles.twoColumns}>
        <Select label="Asignado a" required placeholder="Seleccionar persona..."
          value={assigneeValue} options={members.filter((member) =>
            member.userId !== task.assigneeUserId).map((member) => ({
            value: member.teamId + ':' + member.userId,
            label: member.fullName,
          }))}
          onChange={(event) => setAssigneeValue(event.target.value)} />
        <TextField label="HH estimadas" type="number" required step="0.01" min="0.01"
          value={hours} onChange={(event) => setHours(event.target.value)} />
      </div>
      {members.length === 0 && <p role="alert" className={styles.error}>
        No hay colaboradores activos del equipo asignados al proyecto.
      </p>}
    </div>
  </Modal>;
}
