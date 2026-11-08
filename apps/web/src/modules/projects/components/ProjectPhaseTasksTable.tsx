import type { ReactNode } from 'react';
import {
  type AppliedQuotationPlanning, type ProjectModule, type ProjectModuleTask, type ProjectTeam,
} from '@kora/contracts';
import { PencilIcon, CopyIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { roleFromTeamName } from '@/modules/client-portal/adapters/project-detail.adapter';
import styles from './ProjectModulesCard.module.css';
import { RoadmapTaskStatusBadges } from './RoadmapTaskStatusBadges';

type ReferenceTask = AppliedQuotationPlanning['modules'][number]['tasks'][number];
type CommercialPhase = AppliedQuotationPlanning['modules'][number];
type Row = { kind: 'task'; task: ProjectModuleTask } |
  { kind: 'reference'; reference: ReferenceTask };

interface ProjectPhaseTasksTableProps {
  module: ProjectModule;
  teams?: readonly Pick<ProjectTeam, 'teamId' | 'teamName'>[];
  teamOptions?: ReadonlyArray<{ value: string; label: string }>;
  commercial?: CommercialPhase;
  quotationVersionId?: string;
  references?: readonly ReferenceTask[];
  canManage: boolean;
  readOnly?: boolean;
  referenceDeletePending?: boolean;
  onReviewTask?: (task: ProjectModuleTask) => ReactNode;
  onEditTask?: (task: ProjectModuleTask) => void;
  onDuplicateTask?: (task: ProjectModuleTask) => void;
  onDeleteTask?: (task: ProjectModuleTask) => void;
  onEditReference?: (task: ReferenceTask) => void;
  onDeleteReference?: (task: ReferenceTask) => void;
  onAddTask?: () => void;
}
const formatDate = (value: string | null) => value
  ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL') : '—';
const parseDate = (value: string) => new Date(value + 'T00:00:00');
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const teamColor = (name: string | null) => ({
  dev: '#ea7a1f', pmo: '#64748b', qa: '#3b82f6',
  ux: '#22a55a', ia: '#e0526b', rpa: '#14a3a0',
})[roleFromTeamName(name)];

/** DataTable de Kora con los mismos datos, restricciones y acciones del Roadmap. */
export function ProjectPhaseTasksTable({
  module, teams = [], teamOptions = [], commercial, quotationVersionId,
  references = [], canManage, readOnly = false, referenceDeletePending = false,
  onReviewTask, onEditTask, onDuplicateTask, onDeleteTask,
  onEditReference, onDeleteReference, onAddTask,
}: ProjectPhaseTasksTableProps) {
  const showActions = canManage && !readOnly;
  const count = module.tasks.length + references.length;
  const approved = module.tasks.filter((task) => task.status === 'done').length;
  const rows: Row[] = [
    ...module.tasks.map((task) => ({ kind: 'task' as const, task })),
    ...references.map((reference) => ({ kind: 'reference' as const, reference })),
  ];

  const teamNameFor = (teamId: string | null | undefined, fallback: string) =>
    teams.find((team) => team.teamId === teamId)?.teamName ??
    teamOptions.find((team) => team.value === teamId)?.label ?? fallback;

  const withTeamDot = (name: string, label: string, title?: string) =>
    <span className={styles.operationalBlockName} title={title}>
      <span className={styles.operationalTeamDot} style={{ background: teamColor(name) }} />
      {label}
    </span>;

  const blockFor = (row: Row): ReactNode => {
    if (row.kind === 'reference') {
      const reference = row.reference;
      if (!reference.teamId) return <span className={styles.unlinkedBlock}>
        Sin bloque de origen identificado
      </span>;
      const team = teamNameFor(reference.teamId, reference.role);
      return withTeamDot(team, module.name + ' · ' + team,
        'Bloque de origen de la estimación comercial. La tarea todavía no está vinculada operativamente');
    }
    const task = row.task;
    const linked = module.segments.find((segment) =>
      task.segmentId === segment.id || (!task.segmentId && task.description?.includes(
        'Bloque de trabajo: ' + segment.name + ' · ID ' + segment.id)));
    if (linked) return withTeamDot(linked.teamName, linked.name);
    const source = commercial?.tasks.find((reference) => task.description?.includes(
      'Referencia cotización ' + quotationVersionId +
      ' · WBS ' + reference.wbs + ' · ' + reference.role));
    if (source?.teamId) {
      const team = teamNameFor(source.teamId, source.role);
      return withTeamDot(team, module.name + ' · ' + team,
        'Bloque de origen de la cotización; falta vincular el segmento operativo');
    }
    return <span className={styles.unlinkedBlock}>Sin bloque de origen identificado</span>;
  };

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Tarea', render: (row) =>
      row.kind === 'task' ? row.task.name : row.reference.name },
    { key: 'assignee', header: 'Asignada a', render: (row) =>
      row.kind === 'task' ? row.task.assigneeName || 'Sin asignar' : 'Sin asignar' },
    { key: 'block', header: 'Bloque de trabajo', render: blockFor },
    { key: 'status', header: 'Estado', render: (row) => row.kind === 'task'
      ? <RoadmapTaskStatusBadges status={row.task.status}
          assigned={Boolean(row.task.assigneeUserId)}
          rejectionReason={row.task.rejectionReason}
          overdue={parseDate(row.task.date) < today()} />
      : <RoadmapTaskStatusBadges status="todo" assigned={false}
          unassignedTitle={'Equipo: ' + teamNameFor(row.reference.teamId, row.reference.role)} /> },
  ];

  if (!readOnly) columns.push({
    key: 'hours', header: 'HH est. / reales',
    render: (row) => {
      if (row.kind === 'reference') return row.reference.hours + ' / —';
      const task = row.task;
      return <span title={task.actualHours == null
        ? 'Sin HH aprobadas asociadas explícitamente a esta tarea.'
        : 'HH reales de bitácora aprobadas y vinculadas a esta tarea.'}>
        {task.estimatedHours ?? '—'} / {task.actualHours ?? '—'}
        {(task.pendingHours ?? 0) > 0 && <small className={styles.taskPendingHours}>
          {task.pendingHours?.toLocaleString('es-CL', { maximumFractionDigits: 2 })} HH por aprobar
        </small>}
      </span>;
    },
  });
  columns.push({ key: 'due', header: 'Fecha límite',
    render: (row) => row.kind === 'task' ? formatDate(row.task.date) : '—' });

  if (showActions) columns.push({
    key: 'actions', header: 'Acciones', align: 'right', width: '132px',
    render: (row) => row.kind === 'reference'
      ? <span className={styles.operationalTaskActions}>
        <Button variant="ghost" size="icon"
          aria-label={'Editar tarea ' + row.reference.name} title="Editar tarea"
          onClick={() => onEditReference?.(row.reference)}><PencilIcon size={15} /></Button>
        <Button variant="ghost" size="icon" disabled={referenceDeletePending}
          aria-label={'Eliminar tarea ' + row.reference.name} title="Eliminar tarea"
          onClick={() => onDeleteReference?.(row.reference)}><TrashIcon size={15} /></Button>
      </span>
      : <span className={styles.operationalTaskActions}>
        {row.task.status === 'in_review' && !row.task.cancelledAt && onReviewTask?.(row.task)}
        <Button variant="ghost" size="icon"
          aria-label={'Editar tarea ' + row.task.name} title="Editar tarea"
          onClick={() => onEditTask?.(row.task)}><PencilIcon size={15} /></Button>
        {row.task.assigneeUserId && <Button variant="ghost" size="icon"
          aria-label={'Duplicar tarea ' + row.task.name} title="Duplicar para otra persona"
          onClick={() => onDuplicateTask?.(row.task)}><CopyIcon size={15} /></Button>}
        <Button variant="ghost" size="icon"
          aria-label={'Eliminar tarea ' + row.task.name} title="Eliminar tarea"
          onClick={() => onDeleteTask?.(row.task)}><TrashIcon size={15} /></Button>
      </span>,
  });

  return <details className={styles.operationalTasks} open>
    <summary><strong>Tareas</strong> {count}, {approved} aprobadas</summary>
    {count ? <DataTable columns={columns} items={rows}
      getRowKey={(row) => row.kind === 'task'
        ? 'task:' + row.task.id : 'ref:' + row.reference.wbs + ':' + row.reference.role}
      density="compact" minTableWidth="760px"
      caption={'Tareas de ' + module.name}
      scrollRegionLabel={'Tabla de tareas de ' + module.name} />
      : <p className={styles.noOperationalTasks}>Sin tareas registradas en esta fase.</p>}
    {showActions && <Button variant="outline" size="sm"
      onClick={() => onAddTask?.()}>+ Agregar tarea</Button>}
  </details>;
}
