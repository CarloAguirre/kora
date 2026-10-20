import { Link } from 'react-router-dom';
import type { TeamSummary } from '@kora/contracts';
import styles from './TeamCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Avatar } from '@/shared/components/ui/Avatar';
import { UsersIcon } from '@/shared/components/icons/Icons';
import { TeamTypeIcon, teamTypeBackground } from '../team-type-icons';
import { teamLeaderPreviewPath, teamPath } from '@/app/router/paths';

export interface TeamCardProps {
  team: TeamSummary;
  /** Muestra "Vista líder" (la consola del equipo como la ve su líder). Sin líder asignado no hay vista que mostrar. */
  canPreviewLeader: boolean;
}

/** Editar y eliminar el equipo viven en "Gestionar equipo" (`TeamDetailPage`). */
export function TeamCard({ team, canPreviewLeader }: TeamCardProps) {
  const type = team.teamType;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <div
          className={styles.typeIcon}
          style={{
            background: type ? teamTypeBackground(type.color) : 'var(--kora-surface-muted)',
            color: type ? type.color : 'var(--kora-text-muted)',
          }}
        >
          <TeamTypeIcon icon={type?.icon ?? 'layers'} size={22} />
        </div>
        <div className={styles.identity}>
          <div className={styles.nameRow}>
            <Link to={teamPath(team)} className={styles.name}>
              {team.name}
            </Link>
            {!team.isActive && <Badge tone="neutral">Inactivo</Badge>}
          </div>
          <div className={styles.typeLabel} style={{ color: type ? type.color : 'var(--kora-text-disabled)' }}>
            {type ? type.name : 'Sin tipo'}
          </div>
        </div>
      </div>

      <div>
        <div className={styles.rowLabel}>Líder</div>
        <div className={styles.leaderRow}>
          {team.leader ? (
            <>
              <Avatar name={team.leader.fullName} size={28} />
              <span className={styles.leaderName}>{team.leader.fullName}</span>
            </>
          ) : (
            <span className={styles.leaderMissing}>Sin líder asignado</span>
          )}
        </div>
      </div>

      <div>
        <div className={styles.rowLabel}>Colaboradores</div>
        <div className={styles.membersRow}>
          <UsersIcon size={16} />
          <span className={styles.memberCount}>
            {team.memberCount} persona{team.memberCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className={styles.foot}>
        <Link to={teamPath(team)} className={styles.footButton}>
          <Button variant="outline" size="sm" style={{ width: '100%' }}>
            Gestionar equipo
          </Button>
        </Link>
        {canPreviewLeader && team.leader && (
          <Link to={teamLeaderPreviewPath(team)} className={styles.footButton}>
            <Button variant="outline" size="sm" style={{ width: '100%' }}>
              Vista líder
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}
