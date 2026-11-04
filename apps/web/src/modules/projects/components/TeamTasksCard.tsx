import { useMemo, useState } from 'react';
import {
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type ProjectDetail,
  type ProjectModuleTaskStatus,
  type ProjectTeamMember,
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
import { ExecutionTaskModal } from './ExecutionTaskModal';
import { DuplicateTaskModal } from './DuplicateTaskModal';
import { useCreateProjectModuleTask, useDeleteProjectModuleTask, useUpdateProjectModuleTask } from '../api/projects.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useCheckForecastOverload, useForecastLoadPreview } from '@/modules/forecast/api/forecast.queries';
import { ForecastOverloadAlert, summarizeOverload } from '@/modules/forecast/components/ForecastOverloadAlert';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import type { ForecastOverloadWarning } from '@kora/contracts';
import { assignableOptions } from '@/modules/users/lib/assignable-options';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

const toMemberCandidate = (member: ProjectTeamMember) => ({ value: member.userId, label: member.fullName, status: member.userStatus });

const TASK_TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'unassigned', label: 'Por asignar' },
  { id: 'todo', label: 'Pendientes' },
  { id: 'in_progress', label: 'En curso' },
  { id: 'in_review', label: 'Completadas' },
  { id: 'done', label: 'Aprobadas' },
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
  managerView?: boolean;
}

/**
 * "Tareas del equipo" — tabla + alta/edición/baja de tareas de UN equipo del
 * proyecto. Se usa tanto en `TeamLeaderProjectView` (vista acotada a un solo
 * equipo) como en `DevelopmentProjectDetailView`, cuando quien ve la ficha
 * completa (líder de proyecto o `projects:manage`) también lidera uno de los
 * equipos asignados — en ese caso conserva la vista de administrador, pero
 * sigue pudiendo crear/editar las tareas de su propio equipo.
 */
export function TeamTasksCard({ project, projectId, teamId, managerView = false }: TeamTasksCardProps) {
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
  const [executionEdit, setExecutionEdit] = useState<{ moduleId: string; taskId: string } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<{ moduleId: string; taskId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ moduleId: string; taskId: string } | null>(null);
  const [reassignUserId, setReassignUserId] = useState('');

  const team = useMemo(() => {
    const teamRow = project.teams.find((t) => t.teamId === teamId);
    const members = project.members.filter((m) => m.teamId === teamId && !m.blockedAt);
    const teamName = teamRow?.teamName ?? members[0]?.teamName ?? 'Equipo';
    const leaderId = teamRow?.leader?.id ?? null;
    return { teamId, teamName, leaderId, members };
  }, [project, teamId]);

  const canManageTeam = can('projects:manage') ||
    (user !== null && (team.leaderId === user.id || project.leader?.id === user.id));

  const teamTasks = useMemo(() => {
    return project.modules.flatMap((module) =>
      module.tasks
        .filter((task) => task.teamId === teamId)
        .map((task) => ({
          ...task, moduleId: module.id, moduleName: module.name,
          blockName: module.segments.find((segment) => segment.id === task.segmentId)?.name ??
            module.segments.find((segment) => segment.teamId === teamId)?.name ?? null,
        })),
    );
  }, [project, teamId]);

  const matchesFilter = (task: (typeof teamTasks)[number], filter: TaskFilter) =>
    filter === 'all' || (!task.cancelledAt && (filter === 'unassigned' ? !task.assigneeUserId :
      task.status === filter && (!managerView || Boolean(task.assigneeUserId))));
  const filteredTasks = teamTasks.filter((task) => matchesFilter(task, taskFilter));
  const taskTabCount = (filter: TaskFilter) => teamTasks.filter((task) => matchesFilter(task, filter)).length;
  const { pageItems, pagination } = usePaginatedItems(filteredTasks);

  const openNewTaskModal = () => {
    setEditingTaskId(null);
    setTaskDraft({ ...EMPTY_TASK_DRAFT, moduleId: project.modules[0]?.id ?? '' });
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (moduleId: string, task: (typeof teamTasks)[number]) => {
    setExecutionEdit({ moduleId, taskId: task.id });
  };

  // Fechas ISO (yyyy-mm-dd): la comparación de strings respeta el orden cronológico.
  const startDateError =
    taskDraft.startDate && taskDraft.date && taskDraft.startDate > taskDraft.date
      ? 'Debe ser anterior o igual a la fecha límite.'
      : undefined;
  // Las HH estimadas son el peso de la tarea en el avance real del proyecto — obligatorias.
  const hasEstimatedHours = Number(taskDraft.estimatedHours) > 0;
  const estimatedHoursError =
    taskDraft.estimatedHours !== '' && !hasEstimatedHours ? 'Deben ser mayores a 0.' : undefined;
  // El inicio es obligatorio: el Forecast reparte las HH estimadas entre el inicio y la fecha límite.
  const canSaveTask = Boolean(
    taskDraft.name.trim() && taskDraft.startDate && taskDraft.date && taskDraft.moduleId && hasEstimatedHours && !startDateError,
  );

  // ¿La tarea deja a su responsable sobre el 100 % alguna semana? Mismo cálculo que el Forecast.
  const taskPreviewInput =
    taskModalOpen && taskDraft.assigneeUserId && taskDraft.moduleId && taskDraft.startDate && taskDraft.date && hasEstimatedHours && !startDateError
      ? {
          kind: 'task' as const,
          taskId: editingTaskId?.taskId ?? null,
          moduleId: taskDraft.moduleId,
          teamId,
          assigneeUserId: taskDraft.assigneeUserId,
          startDate: taskDraft.startDate,
          date: taskDraft.date,
          estimatedHours: Number(taskDraft.estimatedHours),
        }
      : null;
  const { data: taskLoadPreview } = useForecastLoadPreview(taskPreviewInput);
  const checkOverload = useCheckForecastOverload();
  const [checkingOverload, setCheckingOverload] = useState(false);
  const [taskOverloadToConfirm, setTaskOverloadToConfirm] = useState<ForecastOverloadWarning[] | null>(null);

  /** Si el responsable queda sobre el 100 % alguna semana, se pide confirmar antes de guardar. */
  const onRequestSaveTask = async () => {
    if (!canSaveTask) return;
    setCheckingOverload(true);
    const warnings = await checkOverload(taskPreviewInput);
    setCheckingOverload(false);
    if (warnings.length > 0) setTaskOverloadToConfirm(warnings);
    else await onSaveTask();
  };

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
            startDate: taskDraft.startDate,
            date: taskDraft.date,
            estimatedHours: Number(taskDraft.estimatedHours),
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
            startDate: taskDraft.startDate,
            date: taskDraft.date,
            estimatedHours: Number(taskDraft.estimatedHours),
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

  const deletingTask = deleteTarget ? teamTasks.find((task) =>
    task.id === deleteTarget.taskId && task.moduleId === deleteTarget.moduleId) : undefined;
  const preserveTask = deletingTask ? (
    deletingTask.status === 'done' || deletingTask.status === 'in_review' ||
    Boolean(deletingTask.assigneeUserId && project.members.some((member) =>
      member.userId === deletingTask.assigneeUserId && member.consumedHours > 0))
  ) : false;

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask.mutateAsync({
        projectId, moduleId: deleteTarget.moduleId, taskId: deleteTarget.taskId,
        cancel: preserveTask,
      });
      toast.success(preserveTask ? 'Tarea cancelada. Las HH registradas siguen en la bitácora.' :
        'Tarea retirada del plan.');
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo procesar la tarea.');
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
        reviewTarget.action === 'approve' ? 'Tarea aprobada.' : reviewTarget.action === 'reject' ? 'Tarea rechazada.' : 'Tarea devuelta a Completada.',
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
        input: { assigneeUserId: userId, status: 'todo' },
      });
      toast.success('Se reasignó la tarea. Se mantienen sus HH estimadas.');
      setReassignTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo reasignar la tarea.');
    }
  };

  const taskMenuItems = (task: (typeof teamTasks)[number]): DropdownMenuItem[] => {
    if (task.cancelledAt) return [];
    if (!managerView) return [
      {
        key: 'reasignar', label: 'Reasignar',
        onSelect: () => {
          setReassignUserId(task.assigneeUserId ?? '');
          setReassignTarget({ moduleId: task.moduleId, taskId: task.id });
        },
      },
      {
        key: 'editar', label: 'Editar',
        onSelect: () => openEditTaskModal(task.moduleId, task),
      },
      {
        key: 'eliminar', label: 'Eliminar', tone: 'danger',
        onSelect: () => setDeleteTarget({ moduleId: task.moduleId, taskId: task.id }),
      },
    ];
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
      onSelect: () => setDeleteTarget({ moduleId: task.moduleId, taskId: task.id }),
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

        <Tabs tabs={(managerView ? TASK_TABS : TASK_TABS.filter((tab) => tab.id !== 'unassigned'))
          .map((tab) => ({
            ...tab, label: `${tab.label} ${taskTabCount(tab.id)}`,
          }))} activeId={taskFilter} onSelect={(id) => setTaskFilter(id as TaskFilter)} />

        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Tarea',
              render: (task) => (
                <span
                  className={styles.taskNameCell}
                  onClick={() => canManageTeam && !task.cancelledAt && task.status !== 'in_review' && openEditTaskModal(task.moduleId, task)}
                >
                  {task.name}
                  {task.rejectionReason && <span className={styles.rejectionNote}>Rechazada: {task.rejectionReason}</span>}
                </span>
              ),
            },
            { key: 'assignee', header: 'Colaborador', render: (task) => task.assigneeName ?? 'Sin asignar' },
            { key: 'module', header: 'Módulo', render: (task) => managerView && task.blockName
              ? `${task.moduleName} · ${task.blockName}` : task.moduleName },
            {
              key: 'status',
              header: 'Estado',
              render: (task) => (
                <span className={[styles.badge, managerView && !task.assigneeUserId
                  ? styles.badgeUnassigned : styles[TASK_STATUS_BADGE_CLASS[task.status]]].join(' ')}>
                  {task.cancelledAt ? 'Cancelada' :
                    !task.assigneeUserId ? 'Por asignar' : PROJECT_MODULE_TASK_STATUS_LABELS[task.status]}
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
                canManageTeam && !task.cancelledAt ? (
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
              onClick={() => void onRequestSaveTask()}
              loading={createTask.isPending || updateTask.isPending || checkingOverload}
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
            options={assignableOptions(team.members, toMemberCandidate, taskDraft.assigneeUserId)}
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
              required
              errorText={estimatedHoursError}
              value={taskDraft.estimatedHours}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, estimatedHours: event.target.value }))}
            />
          </div>
          <div className={styles.row2}>
            <TextField
              label="Fecha de inicio"
              type="date"
              required
              value={taskDraft.startDate}
              max={taskDraft.date || undefined}
              errorText={startDateError}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, startDate: event.target.value }))}
            />
            <TextField
              label="Fecha límite"
              type="date"
              required
              value={taskDraft.date}
              min={taskDraft.startDate || undefined}
              onChange={(event) => setTaskDraft((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>
          <ForecastOverloadAlert warnings={taskPreviewInput ? taskLoadPreview?.warnings : undefined} sourceLabel="esta tarea" />
        </div>
      </Modal>

      <ConfirmActionDialog
        open={taskOverloadToConfirm !== null}
        title="¿Guardar igual?"
        description={taskOverloadToConfirm ? summarizeOverload(taskOverloadToConfirm) : ''}
        confirmLabel="Guardar igual"
        onConfirm={onSaveTask}
        onClose={() => setTaskOverloadToConfirm(null)}
      />

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

      {managerView && <AssignCollaboratorModal
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
        memberOptions={assignableOptions(team.members, toMemberCandidate)}
        initialUserId={reassigningTask?.assigneeUserId ?? ''}
        submitting={updateTask.isPending}
        onCancel={() => setReassignTarget(null)}
        onConfirm={(userId) => void onConfirmReassign(userId)}
      />}
      {!managerView && <Modal open={reassignTarget !== null}
        title="Reasignar tarea" onClose={() => setReassignTarget(null)}
        footer={<>
          <Button variant="outline" onClick={() => setReassignTarget(null)}>Cancelar</Button>
          <Button disabled={!reassignUserId || reassignUserId === reassigningTask?.assigneeUserId}
            loading={updateTask.isPending}
            onClick={() => void onConfirmReassign(reassignUserId)}>Reasignar</Button>
        </>}>
        <p className={styles.taskModalHint}>
          “{reassigningTask?.name}”, hoy asignada a {reassigningTask?.assigneeName ?? 'nadie'}.
          Las horas que ya registró se mantienen en la tarea.
        </p>
        <Select label="Asignar a" value={reassignUserId}
          options={assignableOptions(team.members, toMemberCandidate)}
          onChange={(event) => setReassignUserId(event.target.value)} />
      </Modal>}
      <Modal open={deleteTarget !== null}
        title={preserveTask ? 'No se puede eliminar la tarea' : 'Eliminar tarea'}
        onClose={() => setDeleteTarget(null)} footer={<>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Volver</Button>
          <Button loading={deleteTask.isPending} onClick={() => void onConfirmDelete()}>
            {preserveTask ? 'Cancelar tarea' : 'Eliminar tarea'}
          </Button>
        </>}>
        <p>“{deletingTask?.name}” {preserveTask
          ? 'tiene un estado aprobado o el colaborador registra HH en este proyecto. Se conserva el historial y las horas registradas en la bitácora.'
          : 'se eliminará del plan. Esta acción no puede deshacerse.'}</p>
      </Modal>
      {executionEdit && (() => {
        const task = teamTasks.find((row) => row.id === executionEdit.taskId &&
          row.moduleId === executionEdit.moduleId);
        return task ? <ExecutionTaskModal key={task.id}
          project={project} moduleId={executionEdit.moduleId} task={task}
          allowedTeamId={managerView ? undefined : teamId}
          onClose={() => setExecutionEdit(null)}
          onDuplicate={() => {
            setDuplicateTarget(executionEdit);
            setExecutionEdit(null);
          }} /> : null;
      })()}
      {duplicateTarget && (() => {
        const task = teamTasks.find((row) => row.id === duplicateTarget.taskId &&
          row.moduleId === duplicateTarget.moduleId);
        return task ? <DuplicateTaskModal key={task.id}
          project={project} moduleId={duplicateTarget.moduleId} task={task}
          onClose={() => setDuplicateTarget(null)} /> : null;
      })()}
    </>
  );
}
