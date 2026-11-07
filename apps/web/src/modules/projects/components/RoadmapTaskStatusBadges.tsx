import {
  PROJECT_MODULE_TASK_STATUS_LABELS, type ProjectModuleTask,
} from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import styles from './RoadmapTaskStatusBadges.module.css';

const STATUS_TONE: Record<ProjectModuleTask['status'], BadgeTone> = {
  todo: 'neutral',
  in_progress: 'info',
  in_review: 'warning',
  done: 'success',
};

interface RoadmapTaskStatusBadgesProps {
  status: ProjectModuleTask['status'];
  assigned: boolean;
  overdue?: boolean;
  rejectionReason?: string | null;
  /** Referencia comercial pendiente de materializar: equipo de origen. */
  unassignedTitle?: string;
}

/** Unifica la presentación, sin alterar transiciones ni estados persistidos. */
export function RoadmapTaskStatusBadges({
  status, assigned, overdue = false, rejectionReason, unassignedTitle,
}: RoadmapTaskStatusBadgesProps) {
  return <span className={styles.group}>
    {assigned
      ? <Badge tone={STATUS_TONE[status]} className={styles.compact}>
        {PROJECT_MODULE_TASK_STATUS_LABELS[status]}
      </Badge>
      : <span title={unassignedTitle}>
        <Badge tone="brand" className={[styles.compact, styles.unassigned].join(' ')}>
          Por asignar
        </Badge>
      </span>}
    {assigned && status === 'in_progress' && Boolean(rejectionReason?.trim()) &&
      <span title={rejectionReason ?? undefined}>
        <Badge tone="warning" className={styles.compact}>Devuelta</Badge>
      </span>}
    {assigned && (status === 'todo' || status === 'in_progress') && overdue &&
      <Badge tone="danger" className={styles.compact}>Vencida</Badge>}
  </span>;
}
