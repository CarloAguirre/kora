import { useMemo, useState } from 'react';
import {
  PROJECT_MODULE_TASK_SCOPES,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUSES,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  PROJECT_PHASE_LABELS,
  PROJECT_STATUS_LABELS,
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
import { AlertIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { ProjectTimeline } from './ProjectTimeline';
import {
  useAssignProjectMember,
  useCreateProjectModuleTask,
  useDeleteProjectModuleTask,
  useUnassignProjectMember,
  useUpdateProjectModuleTask,
  useUpdateProjectMember,
} from '../api/projects.queries';
import { useTeamMemberOptions } from '@/modules/teams/api/teams.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { getTeamStyle } from '../utils/team-style';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
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

interface TeamMemberDraftRow {
  key: string;
  assignmentId: string | null;
  teamMemberId: string;
  fullName: string;
  activity: string;
  assignedHours: string;
  consumedHours: number;
  isNew: boolean;
}

/**
 * Vista restringida de la ficha del proyecto para quien lidera SOLO un
 * equipo dentro de él (no el proyecto completo) — mismo `/proyectos/:id`,
 * `ProjectDetailPage` decide renderizar esto en vez de
 * `DevelopmentProjectDetailView` cuando el actor no tiene `projects:manage`
 * pero sí lidera uno de los equipos asignados (ver mockup
 * "10-vista-proyecto-lider-equipo.html"). Aquí gestiona a su propia gente y
 * las tareas de su equipo — el resto de la ficha (Roadmap, Bitácora,
 * Extras) queda fuera de esta vista.
 */
export function TeamLeaderProjectView({
  project,
  projectId,
  teamId,
}: {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: teamMemberOptions } = useTeamMemberOptions();
  const assignMember = useAssignProjectMember();
  const unassignMember = useUnassignProjectMember();
  const updateMember = useUpdateProjectMember();
  const createTask = useCreateProjectModuleTask();
  const updateTask = useUpdateProjectModuleTask();
  const deleteTask = useDeleteProjectModuleTask();

  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<{ moduleId: string; taskId: string } | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(EMPTY_TASK_DRAFT);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamDraft, setTeamDraft] = useState<TeamMemberDraftRow[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);

  const team = useMemo(() => {
    const teamRow = project.teams.find((t) => t.teamId === teamId);
    const members = project.members.filter((m) => m.teamId === teamId);
    const teamName = teamRow?.teamName ?? members[0]?.teamName ?? 'Equipo';
    const leaderId = teamRow?.leader?.id ?? null;
    const leaderName = teamRow?.leader?.fullName ?? null;
    const assignedHours = teamRow?.assignedHours ?? members.reduce((sum, m) => sum + m.assignedHours, 0);
    const consumedHours = members.reduce((sum, m) => sum + m.consumedHours, 0);
    return { teamId, teamName, leaderId, leaderName, assignedHours, consumedHours, members };
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
  const availableMembers = (teamMemberOptions?.items ?? []).filter((m) => m.teamId === teamId);
  const assignedTeamMemberIds = new Set(team.members.map((m) => m.teamMemberId));
  const unassignedMembers = availableMembers.filter((m) => !assignedTeamMemberIds.has(m.id));

  const teamStyle = getTeamStyle(team.teamName);
  const totalAssignedHours = team.members.reduce((sum, m) => sum + m.assignedHours, 0);
  const hoursToAssign = Math.max(0, team.assignedHours - totalAssignedHours);

  const openTeamModal = () => {
    setTeamDraft(
      team.members.map((m) => ({
        key: m.id,
        assignmentId: m.id,
        teamMemberId: m.teamMemberId,
        fullName: m.fullName,
        activity: m.activity ?? '',
        assignedHours: String(m.assignedHours),
        consumedHours: m.consumedHours,
        isNew: false,
      })),
    );
    setTeamModalOpen(true);
  };

  const draftTotalAssigned = teamDraft.reduce((sum, row) => sum + (Number(row.assignedHours) || 0), 0);
  const draftTotalConsumed = teamDraft.reduce((sum, row) => sum + row.consumedHours, 0);
  const draftOverBudget = team.assignedHours > 0 && draftTotalAssigned > team.assignedHours;
  const usedTeamMemberIds = new Set(teamDraft.map((row) => row.teamMemberId));
  const poolLeft = unassignedMembers.filter((m) => !usedTeamMemberIds.has(m.id));

  const updateDraftRow = (key: string, patch: Partial<TeamMemberDraftRow>) => {
    setTeamDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    const next = poolLeft[0];
    if (!next) return;
    setTeamDraft((prev) => [
      ...prev,
      {
        key: `new-${next.id}`,
        assignmentId: null,
        teamMemberId: next.id,
        fullName: next.fullName,
        activity: '',
        assignedHours: '0',
        consumedHours: 0,
        isNew: true,
      },
    ]);
  };

  const removeDraftRow = (key: string) => {
    setTeamDraft((prev) => prev.filter((row) => row.key !== key));
  };

  const onSaveTeamModal = async () => {
    if (draftOverBudget) return;
    setSavingTeam(true);
    try {
      const draftAssignmentIds = new Set(teamDraft.filter((row) => !row.isNew).map((row) => row.assignmentId));
      for (const member of team.members) {
        if (!draftAssignmentIds.has(member.id)) {
          await unassignMember.mutateAsync({ projectId, assignmentId: member.id });
        }
      }
      for (const row of teamDraft) {
        if (row.isNew) {
          await assignMember.mutateAsync({
            projectId,
            input: { teamMemberId: row.teamMemberId, activity: row.activity || undefined, assignedHours: Number(row.assignedHours) || 0 },
          });
          continue;
        }
        const original = team.members.find((m) => m.id === row.assignmentId);
        if (!original) continue;
        const activityChanged = (original.activity ?? '') !== row.activity;
        const hoursChanged = original.assignedHours !== (Number(row.assignedHours) || 0);
        if (activityChanged || hoursChanged) {
          await updateMember.mutateAsync({
            projectId,
            assignmentId: row.assignmentId as string,
            input: { activity: row.activity || null, assignedHours: Number(row.assignedHours) || 0 },
          });
        }
      }
      toast.success('Se actualizó el equipo.');
      setTeamModalOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo guardar los cambios del equipo.');
    } finally {
      setSavingTeam(false);
    }
  };

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
    <div className={styles.page}>
      <Card>
        <div className={styles.infoRow}>
          <div>
            <span className={styles.infoLabel}>Cliente</span>
            <span className={styles.infoValue}>{project.client?.companyName ?? 'Sin cliente'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Responsable comercial</span>
            <span className={styles.infoValue}>{project.commercialManager?.fullName ?? '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Fecha de inicio</span>
            <span className={styles.infoValue}>{project.startDate ? formatDate(project.startDate) : '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Estado del proyecto</span>
            <span className={styles.chip}>{PROJECT_STATUS_LABELS[project.status]}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Etapa de avance</span>
            <span className={styles.chip}>{project.phase ? PROJECT_PHASE_LABELS[project.phase] : '—'}</span>
          </div>
        </div>
      </Card>

      <div className={styles.kpiRow}>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>HH asignadas</span>
          <span className={styles.kpiValue}>{formatHours(team.assignedHours)}</span>
        </Card>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>HH consumidas</span>
          <span className={styles.kpiValue}>{formatHours(team.consumedHours)}</span>
        </Card>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Fecha de entrega estimada</span>
          <span className={styles.kpiValue}>{project.estimatedDeliveryDate ? formatDate(project.estimatedDeliveryDate) : '—'}</span>
        </Card>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Avance real / esperado</span>
          <span className={styles.kpiValue}>
            {project.actualProgress ?? '—'}% / {project.expectedProgress ?? '—'}%
          </span>
        </Card>
      </div>

      <Card>
        <div className={styles.equipoGrid}>
          <div className={styles.equipoLeft}>
            <div className={styles.equipoIcon} style={{ background: teamStyle.color }}>
              {teamStyle.sigla}
            </div>
            <h3 className={styles.equipoName}>{team.teamName}</h3>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas Asignadas</span>
              <span className={styles.equipoStatValue}>{formatHours(team.assignedHours)} hrs</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas por asignar</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>{formatHours(hoursToAssign)}</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas consumidas</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>{formatHours(team.consumedHours)}</span>
            </div>
          </div>

          <div className={styles.equipoRight}>
            <div className={styles.equipoRightHead}>
              <h4>Colaboradores: {team.members.length}</h4>
              {canManageTeam && (
                <Button variant="ghost" size="icon" aria-label="Editar equipo" onClick={openTeamModal}>
                  <PencilIcon size={14} />
                </Button>
              )}
            </div>

            {team.members.length === 0 ? (
              <div className={styles.equipoEmpty}>
                <p>Todavía no hay colaboradores asignados a este equipo en el proyecto.</p>
                {canManageTeam && (
                  <Button type="button" variant="outline" onClick={openTeamModal}>
                    + Asignar colaboradores
                  </Button>
                )}
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Actividad</th>
                    <th>HH asignadas</th>
                    <th>HH consumidas</th>
                    <th>% participación</th>
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.fullName}</td>
                      <td>{member.activity ?? '—'}</td>
                      <td>{formatHours(member.assignedHours)}</td>
                      <td>{formatHours(member.consumedHours)}</td>
                      <td>{team.assignedHours > 0 ? `${Math.round((member.assignedHours / team.assignedHours) * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <p className={styles.sectionTitle}>Timeline del Proyecto</p>
        <div style={{ marginTop: 'var(--kora-space-4)' }}>
          <ProjectTimeline
            phase={project.phase}
            startDate={project.startDate}
            endDate={project.estimatedDeliveryDate ?? project.endDate}
          />
        </div>
      </Card>

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
        open={teamModalOpen}
        title="Editar Equipo"
        wide
        onClose={() => setTeamModalOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setTeamModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void onSaveTeamModal()} loading={savingTeam} disabled={draftOverBudget}>
              Guardar
            </Button>
          </>
        }
      >
        <div className={styles.teamModalBody}>
          <div className={styles.teamModalLeft}>
            <div className={styles.equipoIcon} style={{ background: teamStyle.color }}>
              {teamStyle.sigla}
            </div>
            <h3 className={styles.equipoName}>{team.teamName}</h3>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas {teamStyle.sigla}</span>
              <span className={styles.equipoStatValue}>{formatHours(team.assignedHours)} hrs</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas por asignar</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>
                {formatHours(Math.max(0, team.assignedHours - draftTotalAssigned))}
              </span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Horas consumidas</span>
              <span className={`${styles.equipoStatValue} ${styles.equipoStatBlue}`}>{formatHours(draftTotalConsumed)}</span>
            </div>
            <div className={styles.equipoStat}>
              <span className={styles.equipoStatLabel}>Colaboradores</span>
              <span className={styles.equipoStatValue}>{teamDraft.length}</span>
            </div>
          </div>

          <div className={styles.teamModalRight}>
            {draftOverBudget && (
              <p className={styles.modalError}>Excede el límite de horas disponibles del equipo ({formatHours(team.assignedHours)} hrs).</p>
            )}
            <table className={styles.modalTable}>
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Actividad</th>
                  <th>HH asig.</th>
                  <th>HH cons.</th>
                  <th>% partic.</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {teamDraft.map((row) => {
                  const locked = !row.isNew && row.consumedHours > 0;
                  const pct = team.assignedHours > 0 ? Math.round(((Number(row.assignedHours) || 0) / team.assignedHours) * 100) : 0;
                  const rowOptions = poolLeft.filter((m) => m.id !== row.teamMemberId).concat(
                    unassignedMembers.filter((m) => m.id === row.teamMemberId),
                  );
                  return (
                    <tr key={row.key}>
                      <td>
                        {row.isNew ? (
                          <Select
                            options={rowOptions.map((m) => ({ value: m.id, label: m.fullName }))}
                            value={row.teamMemberId}
                            onChange={(event) => {
                              const picked = unassignedMembers.find((m) => m.id === event.target.value);
                              updateDraftRow(row.key, {
                                teamMemberId: event.target.value,
                                fullName: picked?.fullName ?? row.fullName,
                              });
                            }}
                          />
                        ) : (
                          <span className={styles.modalLockedText}>{row.fullName}</span>
                        )}
                      </td>
                      <td>
                        <input
                          className={styles.modalInput}
                          value={row.activity}
                          placeholder="Actividad"
                          onChange={(event) => updateDraftRow(row.key, { activity: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.modalInput}
                          type="number"
                          min={row.consumedHours}
                          value={row.assignedHours}
                          onChange={(event) => updateDraftRow(row.key, { assignedHours: event.target.value })}
                        />
                      </td>
                      <td>
                        <input className={styles.modalInput} type="number" value={row.consumedHours} disabled />
                      </td>
                      <td>
                        <input className={styles.modalInput} value={`${pct}%`} disabled />
                      </td>
                      <td>
                        {locked ? (
                          <span
                            className={styles.warnIcon}
                            title={`No se puede quitar: ya registró ${row.consumedHours} hh consumidas. Solo se puede modificar horas y actividad.`}
                          >
                            <AlertIcon size={16} />
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar a ${row.fullName}`}
                            onClick={() => removeDraftRow(row.key)}
                          >
                            <TrashIcon size={16} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button type="button" variant="outline" size="sm" disabled={poolLeft.length === 0} onClick={addDraftRow}>
              + Agregar
            </Button>
            <p className={styles.cupoHint}>
              {poolLeft.length === 0
                ? 'No hay más personas disponibles en este equipo para agregar.'
                : `Puedes agregar hasta ${poolLeft.length} colaborador(es) más.`}
            </p>
          </div>
        </div>
      </Modal>

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
    </div>
  );
}
