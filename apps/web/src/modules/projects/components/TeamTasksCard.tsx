import { useMemo, useState } from 'react';
import {
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type ProjectDetail,
  type ProjectModuleTaskStatus,
} from '@kora/contracts';
import styles from './TeamLeaderProjectView.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Tabs } from '@/shared/components/ui/Tabs';
import { Modal } from '@/shared/components/ui/Modal';
import { DataTable } from '@/shared/components/ui/DataTable';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { DropdownMenu, type DropdownMenuItem } from '@/shared/components/ui/DropdownMenu';
import { useToast } from '@/shared/components/ui/Toast';
import { ReviewActionModal, type ReviewAction } from './ReviewActionModal';
import { AssignCollaboratorModal } from './AssignCollaboratorModal';
import { useCreateProjectModuleTask, useDeleteProjectModuleTask, useUpdateProjectModuleTask } from '../api/projects.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

const TASK_TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'in_progress', label: 'En progreso' },
  { id: 'in_review', label: 'En revisión' },
  { id: 'done', label: 'Completadas' },
] as const;
type TaskFilter = (typeof TASK_TABS)[number]['id'];

/** El líder edita a mano entre estos tres — `in_review` solo se alcanza cuando el colaborador envía la tarea a revisión, o el líder la revierte desde el badge de Acciones. */
const TASK_STATUS_OPTIONS = (['todo', 'in_progress', 'done'] as const).map((status) => ({
  value: status,
  label: PROJECT_MODULE_TASK_STATUS_LABELS[status],
}));

const TASK_STATUS_BADGE_CLASS: Record<ProjectModuleTaskStatus, string> = {
  todo: 'badgeMuted',
  in_progress: 'badgeInfo',
  in_review: 'badgeWarning',
  done: 'badgeSuccess',
};

interface TaskDraft {
  name: string;
  description: string;
  assigneeUserId: string;
  moduleId: string;
  status: ProjectModuleTaskStatus;
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
  const { pageItems, pagination } = usePaginatedItems(filteredTasks);

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
      estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : '',
      startDate: task.startDate ?? '',
      date: task.date,
    });
    setTaskModalOpen(true);
  };

  // Fechas ISO (yyyy-mm-dd): la comparación de strings respeta el orden cronológico.
  const startDateError =
    taskDraft.startDate && taskDraft.date && taskDraft.startDate > taskDraft.date
      ? 'Debe ser anterior o igual a la fecha límite.'
      : undefined;
  const canSaveTask = Boolean(taskDraft.name.trim() && taskDraft.date && taskDraft.moduleId && !startDateError);

  const onSaveTask = async () => {
    if (!canSaveTask) return;
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

  // Revisar (aprobar/rechazar/revertir) una tarea que el colaborador ya marcó como lista, o
  // revertir una decisión anterior — mismo modal para tareas y entregas, ver `ReviewActionModal`.
  const [reviewTarget, setReviewTarget] = useState<{ moduleId: string; taskId: string; action: ReviewAction } | null>(null);
  const reviewingTask = reviewTarget ? teamTasks.find((t) => t.id === reviewTarget.taskId) : null;

  const onConfirmReview = async (reason?: string) => {
    if (!reviewTarget || !reviewingTask) return;
    const input =
      reviewTarget.action === 'approve'
        ? { status: 'done' as const, rejectionReason: null }
        : reviewTarget.action === 'reject'
          ? { status: 'in_progress' as const, rejectionReason: reason ?? '' }
          : { status: 'in_review' as const, rejectionReason: null };
    try {
      await updateTask.mutateAsync({ projectId, moduleId: reviewTarget.moduleId, taskId: reviewTarget.taskId, input });
      toast.success(
        reviewTarget.action === 'approve' ? 'Tarea aprobada.' : reviewTarget.action === 'reject' ? 'Tarea rechazada.' : 'Tarea revertida a en revisión.',
      );
      setReviewTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la tarea.');
    }
  };

  // Reasignar el colaborador de una tarea — mismo modal que usa `TeamDeliveriesCard` para entregas.
  const [reassignTarget, setReassignTarget] = useState<{ moduleId: string; taskId: string } | null>(null);
  const reassigningTask = reassignTarget ? teamTasks.find((t) => t.id === reassignTarget.taskId) : null;

  const onConfirmReassign = async (userId: string) => {
    if (!reassignTarget) return;
    try {
      await updateTask.mutateAsync({
        projectId,
        moduleId: reassignTarget.moduleId,
        taskId: reassignTarget.taskId,
        input: { assigneeUserId: userId },
      });
      toast.success('Se reasignó la tarea.');
      setReassignTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo reasignar la tarea.');
    }
  };

  const taskMenuItems = (task: (typeof teamTasks)[number]): DropdownMenuItem[] => {
    const items: DropdownMenuItem[] =
      task.status === 'in_review'
        ? [
            {
              key: 'aprobar',
              label: 'Aprobar',
              tone: 'success',
              onSelect: () => setReviewTarget({ moduleId: task.moduleId, taskId: task.id, action: 'approve' }),
            },
            {
              key: 'rechazar',
              label: 'Rechazar',
              tone: 'danger',
              onSelect: () => setReviewTarget({ moduleId: task.moduleId, taskId: task.id, action: 'reject' }),
            },
            {
              key: 'reasignar',
              label: 'Reasignar',
              onSelect: () => setReassignTarget({ moduleId: task.moduleId, taskId: task.id }),
            },
          ]
        : task.status === 'done' || task.rejectionReason
          ? [
              {
                key: 'revertir',
                label: 'Editar / revertir decisión',
                onSelect: () => setReviewTarget({ moduleId: task.moduleId, taskId: task.id, action: 'revert' }),
              },
              {
                key: 'reasignar',
                label: 'Reasignar',
                onSelect: () => setReassignTarget({ moduleId: task.moduleId, taskId: task.id }),
              },
            ]
          : [
              {
                key: 'completar',
                label: 'Marcar como completada',
                tone: 'success',
                onSelect: () => setReviewTarget({ moduleId: task.moduleId, taskId: task.id, action: 'approve' }),
              },
              {
                key: 'reasignar',
                label: 'Reasignar',
                onSelect: () => setReassignTarget({ moduleId: task.moduleId, taskId: task.id }),
              },
            ];
    items.push({
      key: 'eliminar',
      label: 'Eliminar',
      tone: 'danger',
      onSelect: () => void onDeleteTask(task.moduleId, task.id),
    });
    return items;
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

        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Tarea',
              render: (task) => (
                <span
                  className={styles.taskNameCell}
                  onClick={() => canManageTeam && task.status !== 'in_review' && openEditTaskModal(task.moduleId, task)}
                >
                  {task.name}
                  {task.rejectionReason && <span className={styles.rejectionNote}>Rechazada: {task.rejectionReason}</span>}
                </span>
              ),
            },
            { key: 'assignee', header: 'Colaborador', render: (task) => task.assigneeName ?? '—' },
            { key: 'module', header: 'Módulo', render: (task) => task.moduleName },
            {
              key: 'status',
              header: 'Estado',
              render: (task) => (
                <span className={[styles.badge, styles[TASK_STATUS_BADGE_CLASS[task.status]]].join(' ')}>
                  {PROJECT_MODULE_TASK_STATUS_LABELS[task.status]}
                </span>
              ),
            },
            { key: 'date', header: 'Fecha límite', render: (task) => formatDate(task.date) },
            { key: 'hours', header: 'HH est.', render: (task) => task.estimatedHours ?? '—' },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (task) =>
                canManageTeam ? (
                  <DropdownMenu
                    items={taskMenuItems(task)}
                    trigger={({ onClick }) => (
                      <Button variant="ghost" size="icon" onClick={onClick} aria-label={`Acciones de ${task.name}`}>
                        ⋮
                      </Button>
                    )}
                  />
                ) : null,
            },
          ]}
          items={pageItems}
          getRowKey={(task) => task.id}
          emptyMessage="Sin tareas en este filtro."
        />

        <Pagination {...pagination} />
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
              disabled={!canSaveTask}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className={styles.taskForm}>
          <TextField
            label="Título de la tarea"
            placeholder="Ej. Prototipo de checkout"
            value={taskDraft.name}
            onChange={(event) => setTaskDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Descripción</label>
            <textarea
              className={styles.textarea}
              placeholder="Qué incluye esta tarea"
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
              max={taskDraft.date || undefined}
              errorText={startDateError}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, startDate: event.target.value }))}
            />
            <TextField
              label="Fecha límite"
              type="date"
              value={taskDraft.date}
              min={taskDraft.startDate || undefined}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <ReviewActionModal
        open={reviewTarget !== null}
        action={reviewTarget?.action ?? 'approve'}
        title={
          reviewTarget?.action === 'revert'
            ? 'Editar / revertir decisión — tarea'
            : reviewTarget?.action === 'reject'
              ? 'Rechazar tarea'
              : 'Aprobar tarea'
        }
        summary={
          reviewingTask
            ? [
                { label: 'Tarea', value: reviewingTask.name },
                { label: 'Colaborador', value: reviewingTask.assigneeName ?? 'Sin asignar' },
                { label: 'Módulo', value: reviewingTask.moduleName },
                { label: 'HH estimadas', value: reviewingTask.estimatedHours != null ? `${reviewingTask.estimatedHours} hh` : '—' },
                { label: 'Fecha límite', value: formatDate(reviewingTask.date) },
              ]
            : []
        }
        submitting={updateTask.isPending}
        onCancel={() => setReviewTarget(null)}
        onConfirm={(reason) => void onConfirmReview(reason)}
      />

      <AssignCollaboratorModal
        open={reassignTarget !== null}
        isReassign={Boolean(reassigningTask?.assigneeUserId)}
        summary={
          reassigningTask
            ? [
                { label: 'Tarea', value: reassigningTask.name },
                { label: 'Módulo', value: reassigningTask.moduleName },
                { label: 'Fecha límite', value: formatDate(reassigningTask.date) },
              ]
            : []
        }
        memberOptions={team.members.map((m) => ({ value: m.userId, label: m.fullName }))}
        initialUserId={reassigningTask?.assigneeUserId ?? ''}
        submitting={updateTask.isPending}
        onCancel={() => setReassignTarget(null)}
        onConfirm={(userId) => void onConfirmReassign(userId)}
      />
    </>
  );
}
