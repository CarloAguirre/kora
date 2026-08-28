import { PROJECT_PHASE_LABELS, type ProjectPhase } from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';

const TONE_BY_PHASE: Readonly<Record<ProjectPhase, BadgeTone>> = {
  discovery: 'info',
  development: 'brand',
  testing: 'warning',
  pilot: 'warning',
  closed: 'neutral',
};

export function ProjectPhaseBadge({ phase }: { phase: ProjectPhase | null }) {
  if (!phase) return <Badge tone="neutral">Sin etapa</Badge>;
  return <Badge tone={TONE_BY_PHASE[phase]}>{PROJECT_PHASE_LABELS[phase]}</Badge>;
}
