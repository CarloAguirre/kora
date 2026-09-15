import { useMemo, useState } from 'react';
import {
  PROJECT_MODULE_TASK_SCOPES,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUSES,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type ProjectDetail,
  type ProjectModuleTaskScope,
  type ProjectModuleTaskStatus,
} from '@kora/contracts';
import styles from './TeamLeaderProjectView.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Tabs } from '@/shared/components/ui/Tabs';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { TrashIcon } from '@/shared/components/icons/Icons';
import { useCreateProjectModuleTask, useDeleteProjectModuleTask, useUpdateProjectModuleTask } from '../api/projects.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

const TASK_TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'in_progress', label: 'En progreso' },
  { id: 'done', label: 'Completadas' },
] as const;
type TaskFilter = (typeof TASK_TABS)[number]['id'];

const TASK_STATUS_OPTIONS = PROJECT_MODULE_TASK_STATUSES.map((status) => ({
  value: status,
  label: PROJECT_MODULE_TASK_STATUS_LABELS[status],
}));

const TASK_SCOPE_OPTIONS = PROJECT_MODULE_TASK_SCOPES.map((scope) => ({
  value: scope,
  label: PROJECT_MODULE_TASK_SCOPE_LABELS[scope],
}));

interface TaskDraft {
  name: string;
  description: string;
  assigneeUserId: string;
  moduleId: string;
  status: ProjectModuleTaskStatus;
  scope: ProjectModuleTaskScope;
  estimatedHours: string;
  startDate: string;
  date: string;
}

const EMPTY_TASK_DRAFT: TaskDraft = {
  name: '',
  description: '',
  assigneeUserId: '',
  moduleId: '',
  status: 'todo',
  scope: 'desarrollo',
  estimatedHours: '',
  startDate: '',
  date: '',
};

export interface TeamTasksCardProps {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
}

/**
 * "Tareas del equipo" — tabla + alta/edición/baja de tareas de UN equipo del
 * proyecto. Se usa tanto en `TeamLeaderProjectView` (vista acotada a un solo
 * equipo) como en `DevelopmentProjectDetailView`, cuando quien ve la ficha
 * completa (líder de proyecto o `projects:manage`) también lidera uno de los
 * equipos asignados — en ese caso conserva la vista de administrador, pero
 * sigue pudiendo crear/editar las tareas de su propio equipo.
 */
export function TeamTasksCard({ project, projectId, teamId }: TeamTasksCardProps) {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const createTask = useCreateProjectModuleTask();
  const updateTask = useUpdateProjectModuleTask();
  const deleteTask = useDeleteProjectModuleTask();

  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<{ moduleId: string; taskId: string } | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(EMPTY_TASK_DRAFT);

  const team = useMemo(() => {
    const teamRow = project.teams.find((t) => t.teamId === teamId);
    const members = project.members.filter((m) => m.teamId === teamId);
    const teamName = teamRow?.teamName ?? members[0]?.teamName ?? 'Equipo';
    const leaderId = teamRow?.leader?.id ?? null;
    return { teamId, teamName, leaderId, members };
  }, [project, teamId]);

  const canManageTeam = can('projects:manage') || (user !== null && team.leaderId === user.id);

  const teamTasks = useMemo(() => {
    return project.modules.flatMap((module) =>
      module.tasks
        .filter((task) => task.teamId === teamId)
        .map((task) => ({ ...task, moduleId: module.id, moduleName: module.name })),
    );
  }, [project, teamId]);

  const filteredTasks = teamTasks.filter((task) => taskFilter === 'all' || task.status === taskFilter);

  const openNewTaskModal = () => {
    setEditingTaskId(null);
    setTaskDraft({ ...EMPTY_TASK_DRAFT, moduleId: project.modules[0]?.id ?? '' });
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (moduleId: string, task: (typeof teamTasks)[number]) => {
    setEditingTaskId({ moduleId, taskId: task.id });
    setTaskDraft({
      name: task.name,
      description: task.description ?? '',
      assigneeUserId: task.assigneeUserId ?? '',
      moduleId,
      status: task.status,
      scope: task.scope,
      estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : '',
      startDate: task.startDate ?? '',
      date: task.date,
    });
    setTaskModalOpen(true);
  };

  const onSaveTask = async () => {
    if (!taskDraft.name.trim() || !taskDraft.date || !taskDraft.moduleId) return;
    try {
      if (editingTaskId) {
        await updateTask.mutateAsync({
          projectId,
          moduleId: editingTaskId.moduleId,
          taskId: editingTaskId.taskId,
          input: {
            name: taskDraft.name,
            description: taskDraft.description || undefined,
            assigneeUserId: taskDraft.assigneeUserId || undefined,
            startDate: taskDraft.startDate || null,
            date: taskDraft.date,
            estimatedHours: taskDraft.estimatedHours === '' ? undefined : Number(taskDraft.estimatedHours),
            status: taskDraft.status,
            scope: taskDraft.scope,
          },
        });
        toast.success('Se actualizó la tarea.');
      } else {
        await createTask.mutateAsync({
          projectId,
          moduleId: taskDraft.moduleId,
          input: {
            teamId,
            name: taskDraft.name,
            description: taskDraft.description || undefined,
            assigneeUserId: taskDraft.assigneeUserId || undefined,
            startDate: taskDraft.startDate || undefined,
            date: taskDraft.date,
            estimatedHours: taskDraft.estimatedHours === '' ? undefined : Number(taskDraft.estimatedHours),
            status: taskDraft.status,
            scope: taskDraft.scope,
          },
        });
        toast.success('Se creó la tarea.');
      }
      setTaskModalOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo guardar la tarea.');
    }
  };

  const onDeleteTask = async (moduleId: string, taskId: string) => {
    try {
      await deleteTask.mutateAsync({ projectId, moduleId, taskId });
      toast.success('Se eliminó la tarea.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo eliminar la tarea.');
    }
  };

  return (
    <>
      <Card>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Tareas del equipo</p>
          {canManageTeam && (
            <Button type="button" variant="outline" size="sm" onClick={openNewTaskModal}>
              + Nueva tarea
            </Button>
          )}
        </div>

        <Tabs tabs={[...TASK_TABS]} activeId={taskFilter} onSelect={(id) => setTaskFilter(id as TaskFilter)} />

        {filteredTasks.length === 0 ? (
          <p className={styles.empty}>Sin tareas en este filtro.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Colaborador</th>
                <th>Módulo</th>
                <th>Estado</th>
                <th>Fecha límite</th>
                <th>HH est.</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id}>
                  <td className={styles.taskNameCell} onClick={() => canManageTeam && openEditTaskModal(task.moduleId, task)}>
                    {task.name}
                  </td>
                  <td>{task.assigneeName ?? '—'}</td>
                  <td>{task.moduleName}</td>
                  <td>{PROJECT_MODULE_TASK_STATUS_LABELS[task.status]}</td>
                  <td>{formatDate(task.date)}</td>
                  <td>{task.estimatedHours ?? '—'}</td>
                  <td>
                    {canManageTeam && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void onDeleteTask(task.moduleId, task.id)}
                        aria-label={`Quitar ${task.name}`}
                      >
                        <TrashIcon size={16} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={taskModalOpen}
        title={editingTaskId ? 'Editar tarea' : 'Nueva tarea'}
        onClose={() => setTaskModalOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setTaskModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void onSaveTask()}
              loading={createTask.isPending || updateTask.isPending}
              disabled={!taskDraft.name.trim() || !taskDraft.date || !taskDraft.moduleId}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className={styles.taskForm}>
          <TextField
            label="Título de la tarea"
            value={taskDraft.name}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Descripción</label>
            <textarea
              className={styles.textarea}
              value={taskDraft.description}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <Select
            label="Asignado a"
            placeholder="Sin asignar"
            options={team.members.map((m) => ({ value: m.userId, label: m.fullName }))}
            value={taskDraft.assigneeUserId}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, assigneeUserId: event.target.value }))}
          />
          <Select
            label="Módulo relacionado"
            options={project.modules.map((m) => ({ value: m.id, label: m.name }))}
            value={taskDraft.moduleId}
            disabled={Boolean(editingTaskId)}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, moduleId: event.target.value }))}
          />
          <Select
            label="Ámbito"
            options={TASK_SCOPE_OPTIONS}
            value={taskDraft.scope}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, scope: event.target.value as ProjectModuleTaskScope }))}
          />
          <div className={styles.row2}>
            <Select
              label="Estado"
              options={TASK_STATUS_OPTIONS}
              value={taskDraft.status}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, status: event.target.value as ProjectModuleTaskStatus }))}
            />
            <TextField
              label="HH estimadas"
              type="number"
              min={0}
              value={taskDraft.estimatedHours}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, estimatedHours: event.target.value }))}
            />
          </div>
          <div className={styles.row2}>
            <TextField
              label="Fecha de inicio"
              type="date"
              value={taskDraft.startDate}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, startDate: event.target.value }))}
            />
            <TextField
              label="Fecha límite"
              type="date"
              value={taskDraft.date}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
