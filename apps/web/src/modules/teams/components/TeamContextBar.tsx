import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamMember, TeamSummary } from '@kora/contracts';
import styles from './TeamContextBar.module.css';
import { useTeamDetail } from '../api/teams.queries';
import { CheckIcon, ChevronDownIcon, UsersGroupIcon } from '@/shared/components/icons/Icons';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Selector de equipo — panel propio en vez de un `<select>` nativo: la lista
 * emergente de un `<select>` la dibuja el sistema operativo, no el navegador,
 * así que ni el color de fondo ni el resaltado al pasar el mouse se pueden
 * llevar a la línea gráfica de Kora por CSS. Mismo patrón de apertura/cierre
 * (clic afuera, Escape) que `Combobox`.
 */
function TeamSwitcher({ teams, teamId, onTeamChange }: { teams: TeamSummary[]; teamId: string; onTeamChange: (teamId: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTeam = teams.find((t) => t.id === teamId);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={styles.switcher}>
      <button
        type="button"
        className={styles.teamPill}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <UsersGroupIcon size={16} />
        <span className={styles.teamName}>{activeTeam?.name ?? ''}</span>
        <ChevronDownIcon size={14} className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.switcherPanel} role="listbox" aria-label="Equipo">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === teamId}
              className={[styles.switcherOption, t.id === teamId ? styles.switcherOptionActive : ''].filter(Boolean).join(' ')}
              onClick={() => {
                onTeamChange(t.id);
                setOpen(false);
              }}
            >
              {t.name}
              {t.id === teamId && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barra de contexto de equipo — pegajosa (sticky) bajo el título de página,
 * reemplaza al `<select>` que vivía enterrado arriba a la derecha de la
 * tarjeta "Colaboradores" en `/equipos` y `/horas/aprobaciones`: el equipo
 * activo y quién lo compone quedan visibles durante todo el scroll, y cada
 * avatar es un filtro real (no decorativo) que la página aplica a lo que
 * muestra debajo — proyectos, disponibilidad, cola de aprobación u horas.
 */
export function TeamContextBar({
  teams,
  teamId,
  onTeamChange,
  selectedMember,
  onMemberSelect,
  actions,
}: {
  teams: TeamSummary[];
  teamId: string;
  onTeamChange: (teamId: string) => void;
  selectedMember: TeamMember | null;
  onMemberSelect: (member: TeamMember | null) => void;
  actions?: ReactNode;
}) {
  const { data: team } = useTeamDetail(teamId || null);
  const members = team?.members ?? [];

  return (
    <div className={styles.bar}>
      {teams.length > 1 ? (
        <TeamSwitcher teams={teams} teamId={teamId} onTeamChange={onTeamChange} />
      ) : (
        <div className={styles.teamPillStatic}>
          <UsersGroupIcon size={16} />
          <span className={styles.teamName}>{team?.name ?? ''}</span>
        </div>
      )}

      {members.length > 0 && (
        <>
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>
          <span className={styles.count}>
            {members.length} colaborador{members.length === 1 ? '' : 'es'}
          </span>

          <div className={styles.roster} role="group" aria-label="Filtrar por colaborador">
            <button
              type="button"
              className={[styles.allChip, !selectedMember ? styles.allChipActive : ''].filter(Boolean).join(' ')}
              onClick={() => onMemberSelect(null)}
              aria-pressed={!selectedMember}
            >
              Todos
            </button>
            {members.map((member) => {
              const isLeader = member.userId === team?.leader?.id;
              const isActive = selectedMember?.id === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  className={[styles.avatar, isLeader ? styles.avatarLeader : '', isActive ? styles.avatarActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onMemberSelect(isActive ? null : member)}
                  aria-pressed={isActive}
                  aria-label={isLeader ? `${member.fullName} — Líder de equipo` : member.fullName}
                >
                  <span className={styles.avatarInitials}>{initials(member.fullName)}</span>
                  <span className={styles.avatarCard}>
                    <span className={styles.avatarName}>{member.fullName}</span>
                    <span className={styles.avatarRole}>{isLeader ? 'Líder de equipo' : member.position || 'Colaborador'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.spacer} />

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
