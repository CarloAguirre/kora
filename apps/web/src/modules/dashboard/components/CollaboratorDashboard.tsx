import { useState } from 'react';
import type {
  DashboardHoursSummary,
  DashboardMyPlanning,
  DashboardMyTask,
} from '@kora/contracts';
import styles from './CollaboratorDashboard.module.css';
import { useUpdateProjectModuleTask } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Tabs } from '@/shared/components/ui/Tabs';
import { Badge } from '@/shared/components/ui/Badge';
import { useToast } from '@/shared/components/ui/Toast';
import { ClockIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { CollaboratorKpis, CollaboratorPlanning } from './CollaboratorOverviewSections';
import { RecentHistoryCard } from './RecentHistoryCard';

type TaskTab = 'all' | 'todo' | 'in_progress' | 'in_review' | 'done';

const TABS: readonly { id: TaskTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'todo', label: 'Pendiente' },
  { id: 'in_progress', label: 'En curso' },
  { id: 'in_review', label: 'Completada' },
  { id: 'done', label: 'Aprobada' },
];
const formatHours = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (date: string) => {
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? day + '-' + month + '-' + year : date;
};
const isOverdue = (date: string) => {
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  return date.slice(0, 10) < today;
};

/** Estado visual consistente con las insignias compartidas de Kora. */
function TaskChips({ task }: { task: DashboardMyTask }) {
  return <div className={styles.chips}>
    {task.status === 'done' ? <Badge tone="success">Aprobada</Badge>
      : task.status === 'in_review' ? <Badge tone="warning">Completada</Badge>
        : <>
            <Badge tone={task.status === 'in_progress' ? 'info' : 'neutral'}>
              {task.status === 'in_progress' ? 'En curso' : 'Pendiente'}
            </Badge>
            {task.rejectionReason && <Badge tone="warning">Devuelta</Badge>}
            {isOverdue(task.date) && <Badge tone="danger">Vencida</Badge>}
          </>}
  </div>;
}

interface CollaboratorDashboardProps {
  firstName: string;
  teamName: string | null;
  activeProjectCount: number;
  tasks: readonly DashboardMyTask[];
  hours: DashboardHoursSummary | null;
  planning: DashboardMyPlanning | null;
  loading: boolean;
  weekStart: string | undefined;
  onWeekStartChange: (week: string) => void;
  onRegisterHours: () => void;
  canRegisterHours: boolean;
}

/** Vista única del colaborador. Resúmenes y planning usan el payload autorizado
 * de dashboard; las HH de una tarea proceden de su bitácora vinculada.
 * Nunca convertir aprobación de tarea en horas registradas artificiales.
 */
export function CollaboratorDashboard({
  firstName, teamName, activeProjectCount, tasks, hours, planning,
  loading, weekStart, onWeekStartChange, onRegisterHours, canRegisterHours,
}: CollaboratorDashboardProps) {
  const toast = useToast();
  const updateTask = useUpdateProjectModuleTask();
  const [tab, setTab] = useState<TaskTab>('all');
  const visibleTasks = tasks.filter((task) => tab === 'all' || task.status === tab);
  // Acotar solo cuando el filtro activo devuelve más de cinco tarjetas.
  const scrollTasks = visibleTasks.length > 5;

  const onAdvance = async (task: DashboardMyTask, status: 'in_progress' | 'in_review') => {
    try {
      await updateTask.mutateAsync({
        projectId: task.projectId,
        moduleId: task.moduleId,
        taskId: task.id,
        input: { status },
      });
      toast.success(status === 'in_review'
        ? 'Tarea completada. Queda pendiente de aprobación.'
        : 'Tarea iniciada.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError
        ? error.message : 'No se pudo actualizar la tarea.');
    }
  };

  return <div className={styles.dashboard}>
    <header className={styles.greeting}>
      <div>
        <h1>Mi Panel de Actividad</h1>
        <p>Hola, {firstName} · {teamName ?? 'Colaborador'} · {activeProjectCount}
          {' '}{activeProjectCount === 1 ? 'proyecto' : 'proyectos'}</p>
      </div>
      {canRegisterHours && <Button className={styles.register}
        iconLeft={<ClockIcon size={16} />} onClick={onRegisterHours}>
        Registrar horas
      </Button>}
    </header>

    <CollaboratorKpis hours={hours} tasks={tasks} loading={loading} />

    <Card className={styles.card} role="region" aria-label="Mis tareas">
      <div className={styles.sectionTop}>
        <h2>Mis Tareas</h2>
        {!loading && <span className={styles.count}>{tasks.length}</span>}
      </div>
      <div className={styles.taskTabs}>
        <Tabs
          ariaLabel="Estado de mis tareas"
          tabs={TABS.map((item) => ({
            id: item.id,
            label: item.label + ' ' + tasks.filter(
              (task) => item.id === 'all' || task.status === item.id,
            ).length,
          }))}
          activeId={tab}
          onSelect={(id) => setTab(id as TaskTab)}
        />
      </div>
      {loading ? <p className={styles.empty}>Cargando tareas…</p>
        : visibleTasks.length === 0 ? <p className={styles.empty}>No tienes tareas en este estado.</p>
          : <div className={[styles.taskList, scrollTasks ? styles.taskListScrollable : '']
              .filter(Boolean).join(' ')}
              role={scrollTasks ? 'region' : undefined}
              aria-label={scrollTasks ? 'Lista desplazable de mis tareas' : undefined}
              tabIndex={scrollTasks ? 0 : undefined}>
              {visibleTasks.map((task) => {
                // El avance de registro no es el avance de aprobación de la tarea.
                const approved = Math.max(0, task.approvedHours ?? 0);
                const pending = Math.max(0, task.pendingHours ?? 0);
                const registered = approved + pending;
                const total = task.estimatedHours;
                const percent = total != null && total > 0
                  ? Math.min(100, Math.round(registered / total * 100)) : null;
                const active = task.status === 'todo' || task.status === 'in_progress';
                return <article key={task.id} className={[
                  styles.task, task.rejectionReason && active ? styles.taskReturned : '',
                ].filter(Boolean).join(' ')}>
                  <div className={styles.taskTop}>
                    <div className={styles.taskInfo}>
                      <strong>{task.title}</strong>
                      <span className={styles.taskContext}>
                        {task.projectName} · {task.moduleName}
                        {task.segmentName ? ' · bloque ' + task.segmentName : ''}
                        {' · Límite ' + formatDate(task.date)}
                      </span>
                    </div>
                    <TaskChips task={task} />
                  </div>
                  <div className={styles.taskBody}>
                    {percent !== null && <div className={styles.progressTrack} role="progressbar"
                      aria-label={'HH registradas de ' + task.title}
                      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                      <span className={styles.progressFill} style={{ width: percent + '%' }} />
                    </div>}
                    <span className={styles.taskProgressText}>
                      {total == null
                        ? 'Sin HH estimadas definidas'
                        : formatHours(registered) + ' de ' + formatHours(total) + ' HH estimadas registradas'}
                      {registered > 0 && ' · ' + formatHours(approved) + ' aprobadas'
                        + (pending > 0 ? ', ' + formatHours(pending) + ' pendientes' : '')}
                    </span>
                  </div>
                  {task.rejectionReason && active && <div className={styles.rejection} role="note">
                    <b>Devuelta por el líder:</b> {task.rejectionReason}
                  </div>}
                  {task.status === 'done' && total != null && registered < total && <p className={styles.softNote}>
                    La aprobación de la tarea no completa automáticamente sus HH.
                    El registro de horas se gestiona por jornada según el período permitido.
                  </p>}
                  <div className={styles.taskBottom}>
                    {task.status === 'in_review'
                      ? <span className={styles.waiting}>Esperando aprobación
                          {task.reviewerName ? ' de ' + task.reviewerName : ' del líder'}
                        </span>
                      : task.status === 'done' ? <span className={styles.waiting}>
                          {task.completedAt ? 'Aprobada el ' + formatDate(task.completedAt) : 'Tarea aprobada'}
                        </span>
                        : <span className={isOverdue(task.date) ? styles.overdueDate : styles.waiting}>
                            {isOverdue(task.date) ? 'Fecha límite vencida' : ''}
                          </span>}
                    {task.status === 'todo' && <Button size="sm" variant="outline"
                      disabled={updateTask.isPending}
                      onClick={() => void onAdvance(task, 'in_progress')}>
                      Empezar
                    </Button>}
                    {task.status === 'in_progress' && <Button size="sm" variant="primary"
                      disabled={updateTask.isPending}
                      onClick={() => void onAdvance(task, 'in_review')}>
                      Marcar completada
                    </Button>}
                  </div>
                </article>;
              })}
            </div>}
    </Card>

    <CollaboratorPlanning planning={planning} loading={loading} />

    <RecentHistoryCard weekStart={weekStart} onWeekStartChange={onWeekStartChange}
      tasks={tasks} recentDays={21} />
  </div>;
}
