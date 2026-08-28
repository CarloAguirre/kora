import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TeamSummary } from '@kora/contracts';
import styles from './TeamMembersCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { UserIcon } from '@/shared/components/icons/Icons';
import { useTeamDetail } from '../api/teams.queries';

/**
 * "Colaboradores equipo X" — selector de equipo (si lidera más de uno) y
 * tarjetas de colaboradores. Se repite igual en `/equipos` y en
 * `/horas/aprobaciones` (destino de "Ver Registro de HH de Equipo"): en la
 * v1, `LiderEquipos`/`LiderEquiposPM` tienen esta misma sección como
 * "Colaboradores" en ambas pantallas, no solo en el dashboard principal.
 */
export function TeamMembersCard({
  teams,
  teamId,
  onTeamChange,
  actions,
}: {
  teams: TeamSummary[];
  teamId: string;
  onTeamChange: (teamId: string) => void;
  actions?: ReactNode;
}) {
  const { data: team } = useTeamDetail(teamId || null);

  return (
    <Card className={styles.membersCard}>
      <div className={styles.membersHeader}>
        <h2 className={styles.title}>Colaboradores equipo {team?.name ?? ''}</h2>
        {teams.length > 1 && (
          <Select
            className={styles.teamField}
            label="Seleccionar"
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            value={teamId}
            onChange={(event) => onTeamChange(event.target.value)}
          />
        )}
      </div>

      {(team?.members ?? []).length === 0 ? (
        <p className={styles.empty}>Este equipo aún no tiene colaboradores.</p>
      ) : (
        <div className={styles.memberCards}>
          {(team?.members ?? []).map((member) => (
            <Link key={member.id} to={`/equipos/${teamId}/miembros/${member.id}`} className={styles.memberCard}>
              <div className={styles.memberIcon}>
                <UserIcon size={18} />
              </div>
              <div className={styles.memberInfo}>
                <span className={styles.memberRole}>
                  {member.userId === team?.leader?.id ? 'Líder de equipo' : (member.position ?? 'Colaborador')}
                </span>
                <span className={styles.memberName}>{member.fullName}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {actions && <div className={styles.membersActions}>{actions}</div>}
    </Card>
  );
}
