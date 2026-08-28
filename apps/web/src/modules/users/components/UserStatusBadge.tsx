import { USER_STATUS_LABELS, type UserStatus } from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';

/**
 * Estado de la cuenta como etiqueta de color.
 *
 * Aquí, y solo aquí, se decide qué color le corresponde a cada estado. Ese
 * mapeo estaba repetido en la v1 en cada tabla que mostrara un estado, con
 * variaciones entre pantallas.
 */
const TONE_BY_STATUS: Readonly<Record<UserStatus, BadgeTone>> = {
  active: 'success',
  disabled: 'neutral',
  blocked: 'danger',
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge tone={TONE_BY_STATUS[status]}>{USER_STATUS_LABELS[status]}</Badge>
  );
}
