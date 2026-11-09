import type { ReactNode } from 'react';
import type { QuotationDraftData } from '@kora/contracts';
import { quotationEdtAssignments } from '@kora/contracts';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Badge } from '@/shared/components/ui/Badge';
import type { QuotationTeamCapacityField } from '../lib/quotation-team-capacity-edit';
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
  onEditMappedCollaborators, onEditTeamCapacity, mappingAction,
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
  onEditTeamCapacity: (teamId: string, field: QuotationTeamCapacityField, value: number) => void;
  mappingAction?: ReactNode;
}) {
  const hasEdt = Boolean(draft.aiPoc?.edt);
  // En blanco no hay equipos todavía: editar cualquier celda lo incorporará.
  // La EDT IA conserva la activación explícita para proteger sus asignaciones.
  const canStartManualTeam = !hasEdt;
  const loadFromPlanning = hasEdt || draft.mode === 'phases';
  const all = hasEdt ? quotationEdtAssignments(draft) : [];
  const grouped = new Map<string, number>();
  for (const row of all) grouped.set(row.teamKey,
    Math.round(((grouped.get(row.teamKey) ?? 0) + row.hours) * 100) / 100);
  const rolePeople = new Map(draft.aiPoc?.proposal.roles.map((role) => [
    role.role, draft.edtRoleCollaborators?.find((item) =>
      item.role === role.role)?.collaborators ?? role.people,
  ]) ?? []);
  const weeklyPlan = loadFromPlanning ? quotationTeamWeeklyPlan(draft) : null;
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
      team.duration) * team.hoursPerWeek : 0;
  };
  const capacityForTeam = (teamId: string) => {
    const team = draft.teams.find((row) => row.teamId === teamId);
    if (!team) return null;
    return quotationTeamCapacity(team, getHours(teamId),
      weeklyPlan?.rows.find((row) => row.teamKey === teamId), loadFromPlanning);
  };
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
            ? 'Las HH provienen de las tareas. 40 hh/sem = 100% de dedicación; editar la jornada propone una redistribución con confirmación.'
            : 'Horas = colaboradores × duración × hh/semana. 40 hh/sem = 100% de dedicación.'
          : 'Las horas de cada equipo se suman desde las fases.'}
        {' '}Los líderes de equipo se asignan en Kora.
        {canStartManualTeam && editable && (
          <> Puedes marcar un equipo o editar directamente sus campos para incorporarlo.</>
        )}
      </p>
      <div className={styles.tableScroll}>
        <div className={styles.columns + ' ' + columns}>
          <span>Equipo</span>
          <span>Nº colab.</span>
          {view === 'team' && <>
            <span>Unidad</span><span>Duración</span>
            <span title="Horas de dedicación semanal por persona">hh/sem</span>
            <span title="40 HH por semana equivale a 100%">Dedicación %</span>
          </>}
          <span>Horas</span>
        </div>
        {visibleTeams.map(({ teamId }) => {
          const team = draft.teams.find((t) => t.teamId === teamId);
          const people = team?.collaborators ?? 1;
          const label = teamName(teamId, teamNames);
          const checked = Boolean(team);
          const fieldsEditable = editable && (checked || canStartManualTeam);
          const capacity = capacityForTeam(teamId);
          const warningParts: string[] = [];
          if (capacity && loadFromPlanning && checked) {
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
              warningParts.push('La duración del equipo es inferior a las ' +
                (weeklyPlan?.rows.find((row) => row.teamKey === teamId)?.activeWeeks ?? '—') +
                ' semanas con tareas planificadas.');
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
                disabled={!fieldsEditable}
                aria-label={'Colaboradores de ' + label} value={people}
                title={hasEdt ? 'Dotación de referencia; no cambia las HH de las tareas.' : undefined}
                onChange={(e) => {
                  const count = Number(e.target.value);
                  if (!Number.isInteger(count) || count < 1 || count > 100) return;
                  if (hasEdt) onEditMappedCollaborators(teamId, count);
                  else onEditTeam(teamId, { collaborators: count });
                }}/>
              {view === 'team' && <>
                <Select className={styles.unitField} disabled={!fieldsEditable}
                  aria-label={'Unidad de ' + label} value={team?.unit ?? 'week'}
                  title="Al cambiar unidad se conserva la duración efectiva (5 días por semana)."
                  options={[
                    { value: 'week', label: 'Semanas' },
                    { value: 'day', label: 'Días' },
                  ]}
                  onChange={(e) => {
                    const unit = e.target.value as Team['unit'];
                    const oldUnit = team?.unit ?? 'week';
                    const duration = team?.duration ?? (canStartManualTeam ? 1 : 0);
                    const converted = unit === oldUnit ? duration
                      : unit === 'day' ? duration * 5 : duration / 5;
                    // El contrato admite hasta 520: no truncar silenciosamente.
                    if (converted > 520) return;
                    onEditTeam(teamId, { unit, duration: converted });
                  }} />
                <TextField className={styles.numberField} type="number" min={0} max={520}
                  disabled={!fieldsEditable}
                  aria-label={'Duración de ' + label}
                  value={team?.duration ?? (canStartManualTeam ? 1 : 0)}
                  onChange={(e) => onEditTeam(teamId, {
                    duration: Math.max(0, Number(e.target.value) || 0),
                  })}/>
                <TextField className={styles.numberField} type="number" min={0}
                  max={KORA_QUOTATION_REFERENCE_WEEK_HOURS} step={0.01}
                  disabled={!fieldsEditable}
                  aria-label={'Horas semanales de ' + label}
                  value={team?.hoursPerWeek ?? KORA_QUOTATION_REFERENCE_WEEK_HOURS}
                  onChange={(event) =>
                    onEditTeamCapacity(teamId, 'hoursPerWeek', Number(event.target.value))}/>
                <TextField className={styles.numberField} type="number" min={0}
                  max={100} step={0.01} disabled={!fieldsEditable}
                  aria-label={'Dedicación de ' + label}
                  value={team?.dedicationPercent ?? 100}
                  onChange={(event) =>
                    onEditTeamCapacity(teamId, 'dedicationPercent', Number(event.target.value))}/>
              </>}
              {hasEdt && checked
                ? <QuotationGroupHoursInput className={styles.hoursInput}
                    label={'Horas totales de ' + label}
                    disabled={!editable} value={getHours(teamId)}
                    onCommit={(hours) => onEditGroupHours(teamId, hours)}/>
                : <strong className={styles.hours}>{checked ? fmt(getHours(teamId)) : '—'}</strong>}
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
