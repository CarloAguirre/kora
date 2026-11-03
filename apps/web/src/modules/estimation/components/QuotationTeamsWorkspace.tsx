import { useState, type ReactNode } from 'react';
import type { QuotationDraftData } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { quotationTeamColor } from './quotation-team-colors';
import { QuotationGroupHoursInput } from './QuotationGroupHoursInput';
import { quotationTeamWeeklyPlan } from './quotation-team-weekly-plan';
import styles from './QuotationTeamsWorkspace.module.css';

type Team = QuotationDraftData['teams'][number];
type View = 'team' | 'phases';
const WEEK_PAGE_SIZE = 8;
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
  const [weekPage, setWeekPage] = useState(0);
  const hasEdt = Boolean(draft.aiPoc?.edt);
  const all = hasEdt ? quotationEdtAssignments(draft) : [];
  const grouped = new Map<string, number>();
  for (const row of all) grouped.set(row.teamKey,
    Math.round(((grouped.get(row.teamKey) ?? 0) + row.hours) * 100) / 100);
  const weeklyPlan = quotationTeamWeeklyPlan(draft);
  const weeklyByTeam = new Map(weeklyPlan?.rows.map((row) => [row.teamKey, row]) ?? []);
  const lastPage = weeklyPlan ? Math.max(0, Math.ceil(weeklyPlan.lastWeek / WEEK_PAGE_SIZE) - 1) : 0;
  const currentPage = Math.min(weekPage, lastPage);
  const firstVisibleWeek = currentPage * WEEK_PAGE_SIZE + 1;
  const visibleWeeks = weeklyPlan ? Array.from({
    length: Math.min(WEEK_PAGE_SIZE, weeklyPlan.lastWeek - firstVisibleWeek + 1),
  }, (_, index) => firstVisibleWeek + index) : [];
  const largestWeeklyLoad = Math.max(1, ...(weeklyPlan?.rows.flatMap((row) =>
    [...row.weeklyHours.values()]) ?? []));

  const rolePeople = new Map(draft.aiPoc?.proposal.roles.map((role) => [
    role.role, draft.edtRoleCollaborators?.find((item) =>
      item.role === role.role)?.collaborators ?? role.people,
  ]) ?? []);
  const pendingProfiles = hasEdt
    ? [...grouped].filter(([key]) => key.startsWith('profile:')) : [];
  const visibleTeams = hasEdt
    ? [...grouped].filter(([key]) => !key.startsWith('profile:'))
        .map(([teamId, hours]) => ({ teamId, hours }))
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
  const planned = view === 'team' && (hasEdt || draft.mode === 'phases');
  const columns = planned ? styles.plannedColumns :
    view === 'team' ? styles.detailedColumns : styles.compactColumns;
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
        {planned
          ? hasEdt
            ? 'Las HH provienen de las actividades de la EDT. Las semanas se calculan desde las fases; la dotación es referencial y no multiplica las HH.'
            : 'Las HH se obtienen de las fases comerciales. Las semanas muestran su distribución; colaboradores no recalcula las HH de fase.'
          : hasEdt
            ? 'Las horas de cada equipo se suman desde las tareas de las fases.'
            : view === 'team'
              ? 'Horas = colaboradores × duración × hh/semana × dedicación.'
              : 'Las horas de cada equipo se suman desde las fases.'}
        {' '}Los líderes de equipo se asignan en Kora.
      </p>
      <div className={styles.tableScroll}>
        <div className={styles.columns + ' ' + columns}>
          <span>Equipo</span>
          <span>Nº colab.</span>
          {planned && <><span>Semanas</span><span>HH/sem equipo</span>
            <span>HH/sem/colab.</span></>}
          {view === 'team' && !planned && <>
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
          const weekly = weeklyByTeam.get(teamId);
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
                <span className={styles.teamLabel}>
                  <strong>{label}</strong>
                  {isProfile && <small>Perfil IA sin asociar</small>}
                </span>
              </label>
              <input className={styles.number} type="number" min={1} max={100}
                disabled={!editable || !checked}
                aria-label={'Colaboradores de ' + label} value={people}
                title={hasEdt ? 'Dotación de referencia; no cambia las HH de las tareas.' : undefined}
                onChange={(e) => {
                  const count = Number(e.target.value);
                  if (!Number.isInteger(count) || count < 1 || count > 100) return;
                  if (role) onEditRoleCollaborators(role, count);
                  else if (hasEdt) onEditMappedCollaborators(teamId, count);
                  else onEditTeam(teamId, { collaborators: count });
                }}/>
              {planned && <>
                <div className={styles.weekRange} title={weekly
                  ? 'Participación calculada a partir de los tramos con tareas asignadas'
                  : 'Sin calendario semanal en esta EDT'}>
                  {weekly ? <>
                    <strong>{'S' + weekly.firstWeek +
                      (weekly.lastWeek === weekly.firstWeek ? '' : '–S' + weekly.lastWeek)}</strong>
                    <small>{weekly.activeWeeks} sem. activas</small>
                  </> : <span>—</span>}
                </div>
                <strong className={styles.weekAverage} title="HH totales divididas por semanas activas; no es una capacidad contratada">
                  {weekly ? fmt(weekly.averageHoursPerWeek) : '—'}
                </strong>
                <strong className={styles.weekAverage}
                  aria-label={'Carga semanal por colaborador de ' + label}
                  title="Promedio semanal del equipo dividido por la dotación indicada; no modifica las HH WBS">
                  {weekly && people > 0 ? fmt(weekly.averageHoursPerWeek / people) : '—'}
                </strong>
              </>}
              {view === 'team' && !planned && <>
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
                ? <QuotationGroupHoursInput className={styles.hoursInput}
                    label={'Horas totales de ' + label}
                    disabled={!editable} value={getHours(teamId)}
                    onCommit={(hours) => onEditGroupHours(teamId, hours)}/>
                : <strong className={styles.hours}>{checked ? fmt(getHours(teamId)) : '—'}</strong>}
            </div>
          );
        })}
        {visibleTeams.length === 0 && <p className={styles.empty}>
          {hasEdt
            ? 'Todavía no hay equipos reales de Kora asociados a las actividades de la EDT.'
            : 'Selecciona un equipo para comenzar la estimación.'}
        </p>}
      </div>
      {pendingProfiles.length > 0 && (
        <section className={styles.pendingProfiles} aria-label="Perfiles IA pendientes de asignación">
          <div>
            <h3>Perfiles IA sin equipo Kora</h3>
            <p>Estos perfiles no son equipos. Sus HH siguen en la EDT y no se
              distribuirán comercialmente hasta asociarlos a equipos existentes.</p>
          </div>
          <div className={styles.pendingList}>
            {pendingProfiles.map(([key, hours]) => {
              const role = key.slice(8);
              return <div key={key} className={styles.pendingRole}>
                <strong>{role}</strong>
                <span>{fmt(hours)} HH propuestas</span>
                <label>Colaboradores de referencia
                  <input type="number" min={1} max={100} value={rolePeople.get(role) ?? 1}
                    disabled={!editable} aria-label={'Colaboradores de ' + role}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      if (Number.isInteger(count) && count >= 1 && count <= 100)
                        onEditRoleCollaborators(role, count);
                    }}/>
                </label>
              </div>;
            })}
          </div>
          {mappingAction}
        </section>
      )}
      {pendingProfiles.length === 0 && mappingAction}
      {planned && pendingProfiles.length > 0 && (
        <p className={styles.weeklyUnavailable}>
          La distribución por equipos se habilitará cuando todos los perfiles IA
          estén asociados a equipos reales de Kora. Las HH originales se conservan.
        </p>
      )}
      {planned && pendingProfiles.length === 0 && weeklyPlan && (
        <section className={styles.weeklyPanel} aria-label="Distribución semanal orientativa">
          <div className={styles.weeklyHeading}>
            <div>
              <h3>Carga semanal por equipo</h3>
              <p>Distribución orientativa de HH por fase, no fechas ni asignaciones reales de tareas.</p>
            </div>
            <div className={styles.weekPager} aria-label="Navegación de semanas">
              <button type="button" disabled={currentPage === 0}
                aria-label="Semanas anteriores"
                onClick={() => setWeekPage(currentPage - 1)}>‹</button>
              <span>{'S' + firstVisibleWeek + '–S' + visibleWeeks[visibleWeeks.length - 1] +
                ' de ' + weeklyPlan.lastWeek}</span>
              <button type="button" disabled={currentPage >= lastPage}
                aria-label="Semanas siguientes"
                onClick={() => setWeekPage(currentPage + 1)}>›</button>
            </div>
          </div>
          <div className={styles.weeklyScroll}>
            <table className={styles.weeklyTable}>
              <thead><tr>
                <th scope="col">Equipo</th>
                {visibleWeeks.map((week) => <th scope="col" key={week}>S{week}</th>)}
                <th scope="col">Total HH</th>
              </tr></thead>
              <tbody>
                {visibleTeams.map(({ teamId }) => {
                  const weekly = weeklyByTeam.get(teamId);
                  const label = teamName(teamId, teamNames);
                  return <tr key={teamId}>
                    <th scope="row">
                      <span className={styles.weekTeam}>
                        <i style={{ background: quotationTeamColor(label) }} aria-hidden="true"/>
                        <span>{label}</span>
                      </span>
                    </th>
                    {visibleWeeks.map((week) => {
                      const amount = weekly?.weeklyHours.get(week) ?? 0;
                      return <td key={week} title={label + ' · S' + week + ': ' + fmt(amount) + ' HH orientativas'}>
                        {amount > 0 ? <div className={styles.weekValue}>
                          <span className={styles.weekBar} style={{
                            width: Math.max(4, amount / largestWeeklyLoad * 100) + '%',
                            background: quotationTeamColor(label),
                          }} aria-hidden="true"/>
                          <strong>{fmt(amount)}</strong>
                        </div> : <span className={styles.noHours}>—</span>}
                      </td>;
                    })}
                    <td className={styles.weekTotal}>{fmt(getHours(teamId))}</td>
                  </tr>;
                })}
              </tbody>
              <tfoot><tr>
                <th scope="row">Total</th>
                {visibleWeeks.map((week) =>
                  <td key={week}>{fmt(weeklyPlan.weekTotals.get(week) ?? 0)}</td>)}
                <td>{fmt(weeklyPlan.totalHours)}</td>
              </tr></tfoot>
            </table>
          </div>
          <p className={styles.weeklyFootnote}>
            Las HH de cada equipo se reparten uniformemente dentro de cada fase y se suman cuando las fases se superponen.
            Las semanas y la duración se editan en «Por fases y módulos». Los totales semanales concilian con las HH de la EDT.
          </p>
        </section>
      )}
      {planned && pendingProfiles.length === 0 && !weeklyPlan && (
        <p className={styles.weeklyUnavailable}>
          {hasEdt
            ? 'Esta EDT no contiene una planificación semanal completa. No se inventan semanas ni dedicaciones: define las semanas de sus módulos en «Por fases y módulos».'
            : 'Aún no hay fases con semanas configuradas. Define las fases en «Por fases y módulos» para mostrar la carga semanal.'}
        </p>
      )}
    </div>
  );
}
