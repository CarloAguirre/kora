import { PROJECT_TYPE_LABELS, type ProjectType } from '@kora/contracts';
import { Badge } from '@/shared/components/ui/Badge';

export function ProjectTypeBadge({ type }: { type: ProjectType }) {
  return <Badge tone={type === 'support' ? 'brand' : 'info'}>{PROJECT_TYPE_LABELS[type]}</Badge>;
}
