import type { ReactNode } from 'react';
import type { QuotationDraftData } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Badge } from '@/shared/components/ui/Badge';
import { quotationTeamWeeklyPlan } from './quotation-team-weekly-plan';
import {
  quotationTeamCapacity, KORA_QUOTATION_REFERENCE_WEEK_HOURS,
} from './quotation-team-capacity';
import { quotationTeamColor } from './quotation-team-colors';
import { QuotationGroupHoursInput } from './QuotationGroupHoursInput';
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
  const weeklyPlan = hasEdt || draft.mode === 'phases'
    ? quotationTeamWeeklyPlan(draft) : null;
  const pendingProfiles = hasEdt
    ? [...grouped].filter(([key]) => key.startsWith('profile:')) : [];
  // Misma grilla del prototipo v5 en ambos modos: solo equipos Kora,
  // incluidos los que aún no participan. Jamás un perfil IA como equipo.
  const visibleTeams = [
    ...activeTeams.map((team) => ({ teamId: team.id })),
    ...draft.teams.filter((row) => !activeTeams.some((team) =>
      team.id === row.teamId)).map((team) => ({ teamId: team.teamId })),
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
  const capacityForTeam = (teamId: string) => {
    const team = draft.teams.find((row) => row.teamId === teamId);
    if (!team) return null;
    return quotationTeamCapacity(team, getHours(teamId),
      weeklyPlan?.rows.find((row) => row.teamKey === teamId), hasEdt);
  };
  const capacityProblems = hasEdt ? draft.teams.filter((team) => {
    const audit = capacityForTeam(team.teamId);
    return audit && (audit.overloadedWeeks.length > 0 ||
      audit.overAverageCapacity || audit.durationConflict);
  }).length : 0;
  const columns = view === 'team' ? styles.detailedColumns : styles.compactColumns;
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
        {view === 'team'
          ? hasEdt
            ? 'Las HH de la EDT son la única fuente del esfuerzo comercial. Carga media y ocupación se calculan a partir de esas tareas; dedicación es capacidad planificada y no reduce las HH.'
            : 'Horas = colaboradores × duración × hh/semana × dedicación.'
          : 'Las horas de cada equipo se suman desde las fases.'}
        {' '}Los líderes de equipo se asignan en Kora.
      </p>
      {hasEdt && <div className={styles.capacityContext}
        aria-label="Referencia de capacidad de la cotización">
        <span>Jornada de comparación Kora: <strong>{KORA_QUOTATION_REFERENCE_WEEK_HOURS} HH/sem por persona</strong>.
          El 100% de dedicación indica disponibilidad planificada, no ocupación.
          Los picos son orientativos: las HH se reparten por tramo, no por persona.</span>
        {capacityProblems > 0 && <Badge tone="warning">
          {capacityProblems} equipo(s) requieren revisar capacidad
        </Badge>}
        {!weeklyPlan && <span>Sin calendario EDT: no se pueden verificar picos semanales.</span>}
      </div>}
      <div className={styles.tableScroll}>
        <div className={styles.columns + ' ' + columns}>
          <span>Equipo</span>
          <span>Nº colab.</span>
          {view === 'team' && <>
            <span>Unidad</span><span>Duración</span>
            <span title="HH de tareas por colaborador y semana">Carga media hh/sem</span>
            <span title="Porcentaje de jornada reservado para el proyecto">Dedicación planificada %</span>
            <span>Ocupación (40 HH)</span>
          </>}
          <span>Horas</span>
        </div>
        {visibleTeams.map(({ teamId }) => {
          const team = draft.teams.find((t) => t.teamId === teamId);
          const people = team?.collaborators ?? 1;
          const label = teamName(teamId, teamNames);
          const checked = Boolean(team);
          const capacity = capacityForTeam(teamId);
          const warningParts: string[] = [];
          if (capacity && hasEdt && checked) {
            if (capacity.overloadedWeeks.length) {
              warningParts.push('Sobrecarga en semana(s) ' +
                capacity.overloadedWeeks.join(', ') + ': pico ' +
                fmt(capacity.peakPerPerson ?? 0) + ' HH/persona frente a ' +
                fmt(capacity.capacityPerPerson) + ' HH/persona disponibles.');
            } else if (capacity.overAverageCapacity) {
              warningParts.push('Carga media superior a la dedicación disponible (' +
                fmt(capacity.capacityPerPerson) + ' HH/persona).');
            }
            if (capacity.missingDuration) {
              warningParts.push('Define una duración para distribuir la carga por colaborador.');
            } else if (capacity.durationConflict) {
              warningParts.push('La duración del equipo no cubre el calendario hasta semana ' +
                (weeklyPlan?.rows.find((row) => row.teamKey === teamId)?.lastWeek ?? '—') + '.');
            }
          }
          return (
            <div className={styles.line + ' ' + columns +
              (!checked ? ' ' + styles.inactive : '')} key={teamId}>
              <label className={styles.name}>
                <input type="checkbox" checked={checked}
                  disabled={!editable}
                  title={hasEdt && getHours(teamId) > 0
                    ? 'Para desactivar un equipo con HH, reasigna primero sus tareas en el desglose por fase.'
                    : undefined}
                  aria-label={'Incluir ' + label}
                  onChange={(e) => onToggleTeam(teamId, e.target.checked)}/>
                <i style={{ background: quotationTeamColor(label) }} aria-hidden="true"/>
                <span className={styles.teamLabel}>
                  <strong>{label}</strong>
                </span>
              </label>
              <TextField className={styles.numberField} type="number" min={1} max={100}
                disabled={!editable || !checked}
                aria-label={'Colaboradores de ' + label} value={people}
                title={hasEdt ? 'Dotación de referencia; no cambia las HH de las tareas.' : undefined}
                onChange={(e) => {
                  const count = Number(e.target.value);
                  if (!Number.isInteger(count) || count < 1 || count > 100) return;
                  if (hasEdt) onEditMappedCollaborators(teamId, count);
                  else onEditTeam(teamId, { collaborators: count });
                }}/>
              {view === 'team' && <>
                <Select className={styles.unitField} disabled={!editable || !checked}
                  aria-label={'Unidad de ' + label} value={team?.unit ?? 'week'}
                  options={[
                    { value: 'week', label: 'Semanas' },
                    { value: 'day', label: 'Días' },
                  ]}
                  onChange={(e) => onEditTeam(teamId, {
                    unit: e.target.value as Team['unit'],
                  })} />
                <TextField className={styles.numberField} type="number" min={0} max={520}
                  disabled={!editable || !checked}
                  aria-label={'Duración de ' + label} value={team?.duration ?? 0}
                  onChange={(e) => onEditTeam(teamId, {
                    duration: Math.max(0, Number(e.target.value) || 0),
                  })}/>
                {hasEdt
                  ? <output className={styles.derivedLoad}
                      aria-label={'Carga semanal media de ' + label}
                      title="HH de tareas EDT ÷ número de colaboradores ÷ duración. No altera el presupuesto.">
                      {checked && capacity?.averagePerPerson !== null &&
                        capacity?.averagePerPerson !== undefined
                        ? fmt(capacity.averagePerPerson) : '—'}
                    </output>
                  : <TextField className={styles.numberField} type="number" min={0} max={168}
                      disabled={!editable || !checked}
                      aria-label={'Horas semanales de ' + label}
                      value={team?.hoursPerWeek ?? 40}
                      onChange={(e) => onEditTeam(teamId, {
                        hoursPerWeek: Math.max(0, Number(e.target.value) || 0),
                      })}/>}
                <TextField className={styles.numberField} type="number" min={0} max={100}
                  disabled={!editable || !checked}
                  aria-label={'Dedicación de ' + label}
                  value={team?.dedicationPercent ?? 100}
                  onChange={(e) => onEditTeam(teamId, {
                    dedicationPercent: Math.max(0, Number(e.target.value) || 0),
                  })}/>
                <output className={styles.occupancy}
                  aria-label={'Ocupación estimada de ' + label}
                  title="Carga media frente a la jornada de referencia Kora de 40 HH/sem. Es distinta de la dedicación planificada.">
                  {checked && capacity?.occupationPercent !== null &&
                    capacity?.occupationPercent !== undefined
                    ? fmt(capacity.occupationPercent) + '%' : '—'}
                </output>
              </>}
              {hasEdt && checked
                ? <QuotationGroupHoursInput className={styles.hoursInput}
                    label={'Horas totales de ' + label}
                    disabled={!editable} value={getHours(teamId)}
                    onCommit={(hours) => onEditGroupHours(teamId, hours)}/>
                : <strong className={styles.hours}>{checked ? fmt(getHours(teamId)) : '—'}</strong>}
              {view === 'team' && hasEdt && checked && capacity?.peakWeek !== null &&
                capacity?.peakWeek !== undefined && (
                <p className={styles.peakLoad}>
                  Pico orientativo: semana {capacity.peakWeek}, {fmt(capacity.peakPerPerson ?? 0)}
                  {' '}HH por persona (disponibles: {fmt(capacity.capacityPerPerson)} HH/sem).
                </p>
              )}
              {warningParts.length > 0 && <div className={styles.capacityWarning}
                role="status" aria-label={'Alerta de capacidad de ' + label}>
                <Badge tone="warning">Revisar capacidad</Badge>
                <span>{warningParts.join(' ')}</span>
              </div>}
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
                <TextField className={styles.pendingPeopleField}
                  label="Colaboradores de referencia" type="number" min={1} max={100}
                  value={rolePeople.get(role) ?? 1}
                  disabled={!editable} aria-label={'Colaboradores de ' + role}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    if (Number.isInteger(count) && count >= 1 && count <= 100)
                      onEditRoleCollaborators(role, count);
                  }} />
              </div>;
            })}
          </div>
          {mappingAction}
        </section>
      )}
      {pendingProfiles.length === 0 && mappingAction}
    </div>
  );
}
