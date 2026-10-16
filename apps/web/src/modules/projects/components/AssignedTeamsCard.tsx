import { Link } from 'react-router-dom';
import { projectTeamPath } from '@/app/router/paths';
import { ClockIcon } from '@/shared/components/icons/Icons';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { getTeamStyle } from '../utils/team-style';
import styles from './AssignedTeamsCard.module.css';

export interface AssignedTeamSummary {
  teamId: string;
  teamSlug?: string | null;
  teamName: string;
  leaderName: string | null;
  assignedHours: number;
  consumedHours: number;
}

type TeamHealth = { tone: 'excelente' | 'rango' | 'critico'; label: string };

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * Sobre este % de consumo (sin pasarse) el equipo deja de estar "Excelente" y
 * pasa a "En rango": ya está cerca del tope. El prototipo es estático y no
 * trae la regla, así que el umbral es propio.
 */
const NEAR_BUDGET_RATIO = 0.85;

export function getTeamHealth(assignedHours: number, consumedHours: number): TeamHealth {
  if (consumedHours > assignedHours) {
    return {
      tone: 'critico',
      label: `Crítico — ${formatHours(consumedHours - assignedHours)} hrs sobre presupuesto`,
    };
  }
  if (consumedHours === 0) return { tone: 'critico', label: 'Crítico — sin iniciar' };
  if (consumedHours >= assignedHours * NEAR_BUDGET_RATIO) return { tone: 'rango', label: 'En rango' };
  return { tone: 'excelente', label: 'Excelente' };
}

/**
 * "Equipos Asignados" de la ficha del líder de proyecto — réplica del bloque
 * `equipos-grid` de `ficha_proyecto_lider-actualizada.html`: una tarjeta por
 * equipo con su líder, HH asignadas/utilizadas y el estado de salud. El
 * detalle por persona (y la asignación) vive en la ficha del equipo, a la que
 * lleva cada tarjeta.
 */
export function AssignedTeamsCard({
  project,
  teams,
  onViewHours,
  canOpenTeam = () => true,
}: {
  project: { id: string; slug?: string | null };
  teams: readonly AssignedTeamSummary[];
  onViewHours: () => void;
  /** Qué tarjetas llevan a la ficha del equipo — un líder de equipo solo entra a gestionar el suyo; el resto queda informativo. */
  canOpenTeam?: (teamId: string) => boolean;
}) {
  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>Equipos Asignados</h2>
        <Button variant="outlineDark" size="sm" iconLeft={<ClockIcon size={14} />} onClick={onViewHours}>
          Ver registro de horas
        </Button>
      </div>

      {teams.length > 0 ? (
        <div className={styles.grid}>
          {teams.map((team) => {
            const style = getTeamStyle(team.teamName);
            const health = getTeamHealth(team.assignedHours, team.consumedHours);
            const content = (
              <>
                <span className="srOnly">Equipo {team.teamName}</span>
                <div className={styles.head}>
                  <span className={styles.avatar} style={{ background: style.color }} title={team.teamName}>
                    {style.sigla}
                  </span>
                  <div className={styles.leader}>
                    Líder de equipo
                    <b>{team.leaderName ?? 'Sin líder asignado'}</b>
                  </div>
                </div>
                <div className={styles.figs}>
                  <div>
                    Horas Asignadas
                    <b>{formatHours(team.assignedHours)} hrs</b>
                  </div>
                  <div className={styles.figRight}>
                    Horas Utilizadas
                    <b>{formatHours(team.consumedHours)} hrs</b>
                  </div>
                </div>
                <span className={[styles.health, styles[health.tone]].join(' ')}>● {health.label}</span>
              </>
            );
            return canOpenTeam(team.teamId) ? (
              <Link
                key={team.teamId}
                to={projectTeamPath(project, { id: team.teamId, slug: team.teamSlug })}
                className={styles.teamCard}
                style={{ background: style.bg }}
              >
                {content}
              </Link>
            ) : (
              <div key={team.teamId} className={[styles.teamCard, styles.teamCardStatic].join(' ')} style={{ background: style.bg }}>
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>Este proyecto todavía no tiene equipos asignados.</p>
      )}
    </Card>
  );
}
