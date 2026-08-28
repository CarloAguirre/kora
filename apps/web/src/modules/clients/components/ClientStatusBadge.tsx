import { CLIENT_STATUS_LABELS, type ClientStatus } from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';

const TONE_BY_STATUS: Readonly<Record<ClientStatus, BadgeTone>> = {
  active: 'success',
  inactive: 'neutral',
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <Badge tone={TONE_BY_STATUS[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>
  );
}
