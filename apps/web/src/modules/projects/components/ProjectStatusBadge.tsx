import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';

const TONE_BY_STATUS: Readonly<Record<ProjectStatus, BadgeTone>> = {
  draft: 'neutral',
  active: 'success',
  on_hold: 'warning',
  finished: 'info',
  cancelled: 'danger',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge tone={TONE_BY_STATUS[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>
  );
}
