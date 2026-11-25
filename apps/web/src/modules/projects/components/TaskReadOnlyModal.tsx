import {
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type ProjectModule,
  type ProjectModuleTask,
} from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import styles from './ExecutionTaskModal.module.css';

interface TaskReadOnlyModalProps {
  module: ProjectModule;
  task: ProjectModuleTask;
  onClose: () => void;
}

const formatDate = (value: string) => value
  ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL')
  : '—';

/** Los metadatos de vínculo y cotización no forman parte de la descripción visible en el editor. */
const visibleDescription = (value: string | null) => (value ?? '').split(/\r?\n/)
  .filter((line) => !line.startsWith('Bloque de trabajo: ') &&
    !line.startsWith('Referencia cotización '))
  .join('\n').trim();

/**
 * Comparte orden, etiquetas y campos con "Editar tarea", sin reutilizar ninguna
 * mutación ni permitir cambios. Los readonly mantienen el fondo blanco de Kora
 * (a diferencia de disabled, que dibuja los selectores grises).
 */
export function TaskReadOnlyModal({ module, task, onClose }: TaskReadOnlyModalProps) {
  const block = module.segments.find((segment) => segment.id === task.segmentId);
  const legacyBlockName = task.description?.split(/\r?\n/)
    .find((line) => line.startsWith('Bloque de trabajo: '))
    ?.replace(/^Bloque de trabajo: /, '').replace(/ · ID [a-f0-9-]{36}$/i, '');
  const teamName = task.teamName ??
    module.segments.find((segment) => segment.teamId === task.teamId)?.teamName ??
    'Sin equipo';
  const statusName = task.status === 'todo' && !task.assigneeUserId
    ? 'Por asignar'
    : PROJECT_MODULE_TASK_STATUS_LABELS[task.status];

  return (
    <Modal open title="Detalle de tarea" onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}>
      <div className={styles.form}>
        <TextField label="Título de la tarea" value={task.name} readOnly />
        <div className={styles.textareaField}>
          <label htmlFor={'read-task-description-' + task.id}>Descripción</label>
          <textarea id={'read-task-description-' + task.id} rows={3}
            value={visibleDescription(task.description)} readOnly />
        </div>
        <TextField label="Equipo responsable" value={teamName} readOnly />
        <TextField label="Asignado a" value={task.assigneeName ?? 'Sin asignar'} readOnly />
        <TextField label="Módulo relacionado" value={module.name} readOnly />
        <TextField label="Bloque de trabajo"
          value={task.segmentName ?? block?.name ?? legacyBlockName ?? 'Sin bloque planificado'} readOnly />
        <div className={styles.twoColumns}>
          <TextField label="Estado" value={statusName} readOnly />
          <TextField label="HH estimadas"
            value={task.estimatedHours == null ? '—' : String(task.estimatedHours)} readOnly />
        </div>
        <div className={styles.twoColumns}>
          <TextField label="Fecha de inicio" value={formatDate(task.startDate)} readOnly />
          <TextField label="Fecha límite" value={formatDate(task.date)} readOnly />
        </div>
      </div>
    </Modal>
  );
}
