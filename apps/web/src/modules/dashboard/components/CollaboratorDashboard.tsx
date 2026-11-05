import { useState } from 'react';
import type { DashboardMyTask, HourEntrySummary } from '@kora/contracts';
import styles from './CollaboratorDashboard.module.css';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { useUpdateProjectModuleTask } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { ClockIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';

type TaskTab = 'todo' | 'in_review' | 'done';

const formatHours = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (date: string) => {
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? `${day}-${month}-${year}` : date;
};
const isOverdue = (date: string) => {
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  return date.slice(0, 10) < today;
};
const tabOf = (task: DashboardMyTask): TaskTab =>
  task.status === 'done' ? 'done' : task.status === 'in_review' ? 'in_review' : 'todo';

function TaskChips({ task }: { task: DashboardMyTask }) {
  return (
    <span className={styles.chips}>
      {task.status === 'done' ? <span className={[styles.chip, styles.approved].join(' ')}>Aprobada</span>
        : task.status === 'in_review' ? <span className={[styles.chip, styles.completed].join(' ')}>Completada</span>
        : <>
            <span className={[styles.chip, task.status === 'in_progress' ? styles.running : styles.pending].join(' ')}>
              {task.status === 'in_progress' ? 'En curso' : 'Pendiente'}
            </span>
            {task.rejectionReason && <span className={[styles.chip, styles.returned].join(' ')}>Devuelta</span>}
            {isOverdue(task.date) && <span className={[styles.chip, styles.overdue].join(' ')}>Vencida</span>}
          </>}
    </span>
  );
}

function EntryLink({ entry, tasks }: { entry: HourEntrySummary; tasks: readonly DashboardMyTask[] }) {
  const task = entry.taskId ? tasks.find((item) => item.id === entry.taskId) : undefined;
  return (
    <div className={styles.links}>
      <span>{entry.project?.name ?? entry.assignment ?? 'Sin proyecto'}</span>
      {(entry.module || entry.segment || task) && (
        <span className={styles.pills}>
          {entry.module && <span>{entry.module.name}</span>}
          {entry.segment && <span>{entry.segment.name}</span>}
          {task && <span>{task.title}</span>}
        </span>
      )}
    </div>
  );
}

interface CollaboratorDashboardProps {
  firstName: string;
  teamName: string | null;
  activeProjectCount: number;
  tasks: readonly DashboardMyTask[];
  loading: boolean;
  onRegisterHours: () => void;
  canRegisterHours: boolean;
}

/**
 * Tablero personal v5.02. Solo usa tareas asignadas al usuario y su propia
 * bitácora autorizada; no infiere HH reales de tareas aprobadas.
 */
export function CollaboratorDashboard({
  firstName, teamName, activeProjectCount, tasks, loading, onRegisterHours, canRegisterHours,
}: CollaboratorDashboardProps) {
  const { user } = useAuth();
  const toast = useToast();
  const updateTask = useUpdateProjectModuleTask();
  const [tab, setTab] = useState<TaskTab>('todo');
  const { data: entries, isLoading: loadingEntries, isError: entriesError } = useHourEntriesList(
    {
      userId: user?.id,
      page: 1,
      pageSize: 8,
      sortField: 'date',
      sortDirection: 'desc',
    },
    { enabled: Boolean(user?.id) },
  );
  const tabs: { id: TaskTab; label: string }[] = [
    { id: 'todo', label: 'Por hacer' },
    { id: 'in_review', label: 'Por aprobar' },
    { id: 'done', label: 'Aprobadas' },
  ];
  const visibleTasks = tasks.filter((task) => tabOf(task) === tab);
  const onComplete = async (task: DashboardMyTask) => {
    try {
      await updateTask.mutateAsync({
        projectId: task.projectId,
        moduleId: task.moduleId,
        taskId: task.id,
        input: { status: 'in_review' },
      });
      toast.success('Tarea completada. Queda pendiente de aprobación.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo marcar la tarea como terminada.');
    }
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.greeting}>
        <div>
          <h1>Hola, {firstName}</h1>
          <p>{teamName ?? 'Colaborador'}, en {activeProjectCount} {activeProjectCount === 1 ? 'proyecto' : 'proyectos'}</p>
        </div>
        {canRegisterHours && <Button className={styles.register} iconLeft={<ClockIcon size={16} />} onClick={onRegisterHours}>
          Registrar horas
        </Button>}
      </div>

      <section className={styles.card} aria-label="Mis tareas">
        <h2>Mis tareas</h2>
        <div className={styles.tabs} role="tablist" aria-label="Estado de mis tareas">
          {tabs.map((item) => (
            <button
              key={item.id} type="button" role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? styles.activeTab : ''}
              onClick={() => setTab(item.id)}
            >
              {item.label} <span>{tasks.filter((task) => tabOf(task) === item.id).length}</span>
            </button>
          ))}
        </div>
        {loading ? <p className={styles.empty}>Cargando tareas…</p> : visibleTasks.length === 0
          ? <p className={styles.empty}>No tienes tareas en este estado.</p>
          : <div className={styles.taskList}>
              {visibleTasks.map((task) => (
                <article key={task.id} className={[styles.task, task.rejectionReason && tab === 'todo' ? styles.taskReturned : ''].join(' ')}>
                  <div className={styles.taskTop}>
                    <div className={styles.taskInfo}>
                      <strong>{task.title}</strong>
                      <span className={styles.taskContext}>
                        {task.projectName} · {task.moduleName}{task.segmentName ? ` · bloque ${task.segmentName}` : ''}
                      </span>
                    </div>
                    <TaskChips task={task} />
                  </div>
                  {task.rejectionReason && tab === 'todo' && (
                    <div className={styles.rejection} role="note"><b>Devuelta:</b> {task.rejectionReason}</div>
                  )}
                  <div className={styles.taskBottom}>
                    <span>
                      Límite <b className={isOverdue(task.date) && tab === 'todo' ? styles.overdueDate : ''}>{formatDate(task.date)}</b>.
                      {' '}{task.estimatedHours == null ? 'HH estimadas sin definir' : `${formatHours(task.estimatedHours)} HH estimadas`},
                      {' '}{formatHours(task.approvedHours ?? 0)} aprobadas
                      {(task.pendingHours ?? 0) > 0 && ` y ${formatHours(task.pendingHours ?? 0)} por aprobar`}.
                    </span>
                    {tab === 'todo' && (
                      <Button
                        size="sm" className={styles.markDone} onClick={() => void onComplete(task)}
                        disabled={updateTask.isPending}
                      >Marcar terminada</Button>
                    )}
                    {tab === 'in_review' && <span className={styles.waiting}>Esperando aprobación {task.reviewerName ? `de ${task.reviewerName}` : 'del líder'}</span>}
                  </div>
                </article>
              ))}
            </div>}
      </section>

      <section className={styles.card} aria-label="Mis registros de horas">
        <div className={styles.hoursHeading}>
          <h2>Mis registros de horas</h2>
          <span>Las aprueba tu líder de equipo.</span>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr>
              <th>Fecha</th><th>Asignación y vínculo</th><th>Actividad</th>
              <th className={styles.numeric}>Horas</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {loadingEntries ? <tr><td colSpan={5}>Cargando registros…</td></tr>
                : entriesError ? <tr><td colSpan={5}>No se pudieron cargar los registros de horas.</td></tr>
                : (entries?.items ?? []).length === 0 ? <tr><td colSpan={5}>Todavía no tienes registros de horas.</td></tr>
                : entries!.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.date)}</td>
                      <td><EntryLink entry={entry} tasks={tasks} /></td>
                      <td>{entry.category}</td>
                      <td className={styles.numeric}>{formatHours(entry.hours)}</td>
                      <td><span className={[styles.chip, entry.status === 'approved' ? styles.approved : entry.status === 'rejected' ? styles.overdue : styles.completed].join(' ')}>{entry.status === 'approved' ? 'Aprobada' : entry.status === 'rejected' ? 'Rechazada' : 'Por aprobar'}</span></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
