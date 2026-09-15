import { Link } from 'react-router-dom';
import type { TeamSummary } from '@kora/contracts';
import styles from './TeamCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Avatar } from '@/shared/components/ui/Avatar';
import { PencilIcon, TrashIcon, UsersIcon } from '@/shared/components/icons/Icons';
import { TeamTypeIcon, teamTypeBackground } from '../team-type-icons';

export interface TeamCardProps {
  team: TeamSummary;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function TeamCard({ team, canManage, onEdit, onDelete }: TeamCardProps) {
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
            <Link to={`/equipos/${team.id}`} className={styles.name}>
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
        <Link to={`/equipos/${team.id}`} className={styles.manageButton}>
          <Button variant="outline" size="sm" style={{ width: '100%' }}>
            Gestionar equipo
          </Button>
        </Link>
        {canManage && (
          <div className={styles.actions}>
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Editar ${team.name}`}>
              <PencilIcon size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Eliminar ${team.name}`}>
              <TrashIcon size={16} />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
