import type { ReactNode } from 'react';
import type { QuotationDraftData } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { quotationTeamColor } from './quotation-team-colors';
import styles from './QuotationTeamsWorkspace.module.css';

type Team = QuotationDraftData['teams'][number];
type View = 'team' | 'phases';
const fmt = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const teamName = (key: string, names: ReadonlyMap<string, string>) =>
  key.startsWith('profile:') ? key.slice(8) : names.get(key) ?? 'Equipo';

export function QuotationTeamsWorkspace({
  draft, editable, teamNames, activeTeams, view, onChangeView,
  onEditTeam, onToggleTeam, onEditGroupHours, onEditRoleCollaborators,
  onEditMappedCollaborators, mappingAction,
}: {
  draft: QuotationDraftData;
  editable: boolean;
  teamNames: ReadonlyMap<string, string>;
  activeTeams: readonly { id: string; name: string }[];
  view: View;
  onChangeView: (value: View) => void;
  onEditTeam: (teamId: string, patch: Partial<Team>) => void;
  onToggleTeam: (teamId: string, checked: boolean) => void;
  onEditGroupHours: (teamKey: string, hours: number) => void;
  onEditRoleCollaborators: (role: string, people: number) => void;
  onEditMappedCollaborators: (teamId: string, people: number) => void;
  mappingAction?: ReactNode;
}) {
  const hasEdt = Boolean(draft.aiPoc?.edt);
  const all = hasEdt ? quotationEdtAssignments(draft) : [];
  const grouped = new Map<string, number>();
  for (const row of all) grouped.set(row.teamKey,
    Math.round(((grouped.get(row.teamKey) ?? 0) + row.hours) * 100) / 100);
  const rolePeople = new Map(draft.aiPoc?.proposal.roles.map((role) => [
    role.role, draft.edtRoleCollaborators?.find((item) =>
      item.role === role.role)?.collaborators ?? role.people,
  ]) ?? []);
  const visibleTeams = hasEdt
    ? [...grouped].map(([teamId, hours]) => ({ teamId, hours }))
    : [
        ...draft.teams.map((team) => ({ teamId: team.teamId, hours: 0 })),
        ...activeTeams.filter((team) => !draft.teams.some((row) =>
          row.teamId === team.id)).map((team) => ({ teamId: team.id, hours: 0 })),
      ];
  const getHours = (teamId: string): number => {
    if (hasEdt) return grouped.get(teamId) ?? 0;
    if (draft.mode === 'phases') {
      return draft.phases.reduce((sum, phase) => sum + (phase.teamHours.find(
        (row) => row.teamId === teamId)?.hours ?? 0), 0);
    }
    const team = draft.teams.find((t) => t.teamId === teamId);
    return team ? team.collaborators * (team.unit === 'day' ? team.duration / 5 :
      team.duration) * team.hoursPerWeek * team.dedicationPercent / 100 : 0;
  };
  const columns = view === 'team' && !hasEdt
    ? styles.detailedColumns : styles.compactColumns;
  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <h2>Equipos</h2>
        <SegmentedControl aria-label="Vista de equipos"
          options={[
            { value: 'team', label: 'Por equipo' },
            { value: 'phases', label: 'Por fases y módulos' },
          ]}
          value={view} onChange={(value) => onChangeView(value as View)}/>
      </div>
      <p className={styles.caption}>
        {hasEdt ? 'Las horas de cada equipo se suman desde las tareas de las fases.'
          : view === 'team'
            ? 'Horas = colaboradores × duración × hh/semana × dedicación.'
            : 'Las horas de cada equipo se suman desde las fases.'}
        {' '}Los líderes de equipo se asignan en Kora.
      </p>
      <div className={styles.tableScroll}>
        <div className={styles.columns + ' ' + columns}>
          <span>Equipo</span>
          <span>Nº colab.</span>
          {view === 'team' && !hasEdt && <>
            <span>Unidad</span><span>Duración</span><span>hh/sem</span>
            <span>Dedicación</span>
          </>}
          <span>Horas</span>
        </div>
        {visibleTeams.map(({ teamId }) => {
          const team = draft.teams.find((t) => t.teamId === teamId);
          const isProfile = teamId.startsWith('profile:');
          const role = isProfile ? teamId.slice(8) : null;
          const people = role ? rolePeople.get(role) ?? 1 : team?.collaborators ?? 1;
          const label = teamName(teamId, teamNames);
          const checked = hasEdt ? true : Boolean(team);
          return (
            <div className={styles.line + ' ' + columns +
              (!checked ? ' ' + styles.inactive : '')} key={teamId}>
              <label className={styles.name}>
                <input type="checkbox" checked={checked}
                  disabled={!editable || hasEdt}
                  title={hasEdt ? 'Las tareas se reasignan desde el desglose por fase.' : undefined}
                  aria-label={'Incluir ' + label}
                  onChange={(e) => onToggleTeam(teamId, e.target.checked)}/>
                <i style={{ background: quotationTeamColor(label) }} aria-hidden="true"/>
                <strong>{label}</strong>
              </label>
              <input className={styles.number} type="number" min={1} max={100}
                disabled={!editable || !checked}
                aria-label={'Colaboradores de ' + label} value={people}
                onChange={(e) => {
                  const count = Number(e.target.value);
                  if (!Number.isInteger(count) || count < 1 || count > 100) return;
                  if (role) onEditRoleCollaborators(role, count);
                  else if (hasEdt) onEditMappedCollaborators(teamId, count);
                  else onEditTeam(teamId, { collaborators: count });
                }}/>
              {view === 'team' && !hasEdt && <>
                <select disabled={!editable || !checked}
                  aria-label={'Unidad de ' + label} value={team?.unit ?? 'week'}
                  onChange={(e) => onEditTeam(teamId, {
                    unit: e.target.value as Team['unit'],
                  })}>
                  <option value="week">Semanas</option>
                  <option value="day">Días</option>
                </select>
                <input className={styles.number} type="number" min={0} max={520}
                  disabled={!editable || !checked}
                  aria-label={'Duración de ' + label} value={team?.duration ?? 0}
                  onChange={(e) => onEditTeam(teamId, {
                    duration: Math.max(0, Number(e.target.value) || 0),
                  })}/>
                <input className={styles.number} type="number" min={0} max={168}
                  disabled={!editable || !checked}
                  aria-label={'Horas semanales de ' + label}
                  value={team?.hoursPerWeek ?? 40}
                  onChange={(e) => onEditTeam(teamId, {
                    hoursPerWeek: Math.max(0, Number(e.target.value) || 0),
                  })}/>
                <input className={styles.number} type="number" min={0} max={100}
                  disabled={!editable || !checked}
                  aria-label={'Dedicación de ' + label}
                  value={team?.dedicationPercent ?? 100}
                  onChange={(e) => onEditTeam(teamId, {
                    dedicationPercent: Math.max(0, Number(e.target.value) || 0),
                  })}/>
              </>}
              {hasEdt
                ? <input className={styles.hoursInput} type="number" min={0} step="0.01"
                    aria-label={'Horas totales de ' + label}
                    disabled={!editable} value={getHours(teamId)}
                    onChange={(e) => {
                      const hours = Number(e.target.value);
                      if (Number.isFinite(hours) && hours >= 0)
                        onEditGroupHours(teamId, hours);
                    }}/>
                : <strong className={styles.hours}>{checked ? fmt(getHours(teamId)) : '—'}</strong>}
            </div>
          );
        })}
        {visibleTeams.length === 0 && <p className={styles.empty}>
          Selecciona un equipo para comenzar la estimación.
        </p>}
      </div>
      {mappingAction}
    </div>
  );
}
