import {
  LEADER_PROFILE_LABELS,
  ROLE_LABELS,
  type LeaderProfile,
  type RoleCode,
} from '@kora/contracts';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';

/**
 * Rol como etiqueta.
 *
 * Para un líder muestra además su perfil derivado (PM, de equipo o ambos), que
 * es información que el administrador necesita ver pero NO puede editar: sale
 * de las asignaciones reales de la persona.
 */
const TONE_BY_ROLE: Readonly<Record<RoleCode, BadgeTone>> = {
  admin: 'brand',
  pmo: 'brand',
  leader: 'info',
  collaborator: 'neutral',
  commercial: 'warning',
};

export interface UserRoleBadgeProps {
  role: RoleCode;
  leaderProfile?: LeaderProfile | null;
}

export function UserRoleBadge({ role, leaderProfile }: UserRoleBadgeProps) {
  const label =
    role === 'leader' && leaderProfile ? LEADER_PROFILE_LABELS[leaderProfile] : ROLE_LABELS[role];

  return <Badge tone={TONE_BY_ROLE[role]}>{label}</Badge>;
}
