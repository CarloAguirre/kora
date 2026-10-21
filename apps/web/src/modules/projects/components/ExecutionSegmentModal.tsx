import { useEffect, useMemo, useState } from 'react';
import {
  isForecastAssignableRole,
  type CreateProjectModuleSegmentInput,
  type ForecastOverloadWarning,
  type ProjectModuleSegment,
} from '@kora/contracts';
import styles from './DeliveryModal.module.css';
import segmentStyles from './ExecutionSegmentModal.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { CloseIcon } from '@/shared/components/icons/Icons';
import { useTeamDetail } from '@/modules/teams/api/teams.queries';
import { useCheckForecastOverload, useForecastLoadPreview } from '@/modules/forecast/api/forecast.queries';
import { ForecastOverloadAlert, summarizeOverload } from '@/modules/forecast/components/ForecastOverloadAlert';
import { useHolidays } from '@/modules/hours/api/hours.queries';
import { addBusinessDays, countBusinessDays } from '../lib/business-days';

export interface ExecutionSegmentMemberValue {
  teamMemberId: string;
  fullName: string;
  /** Texto del campo — vacío ⇔ sin % (el colaborador queda asignado, pero no carga HH al Forecast). */
  dailyPercent: string;
}

export interface ExecutionSegmentModalValues {
  teamId: string;
  name: string;
  startDate: string;
  endDate: string;
  members: ExecutionSegmentMemberValue[];
}

export const EMPTY_EXECUTION_SEGMENT_MODAL_VALUES: ExecutionSegmentModalValues = {
  teamId: '',
  name: '',
  startDate: '',
  endDate: '',
  members: [],
};

export function segmentToModalValues(segment: ProjectModuleSegment): ExecutionSegmentModalValues {
  return {
    teamId: segment.teamId,
    name: segment.name,
    startDate: segment.startDate,
    endDate: segment.endDate,
    members: segment.members.map((member) => ({
      teamMemberId: member.teamMemberId,
      fullName: member.fullName,
      dailyPercent: member.dailyPercent != null ? String(member.dailyPercent) : '',
    })),
  };
}

export function toSegmentInput(values: ExecutionSegmentModalValues): CreateProjectModuleSegmentInput {
  return {
    teamId: values.teamId,
    name: values.name.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    members: values.members.map((member) => ({
      teamMemberId: member.teamMemberId,
      dailyPercent: member.dailyPercent.trim() ? Number(member.dailyPercent) : null,
    })),
  };
}

/** "José Aponte 50% · Ana Pérez" — línea de colaboradores en el listado de tiempos de ejecución. */
export function formatSegmentMembers(members: ReadonlyArray<{ fullName: string; dailyPercent: number | string | null }>): string {
  return members
    .map((member) => {
      const percent = member.dailyPercent === null || member.dailyPercent === '' ? null : member.dailyPercent;
      return percent !== null ? `${member.fullName} ${percent}%` : member.fullName;
    })
    .join(' · ');
}

function percentError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 1 && percent <= 100 ? undefined : 'Entre 1 y 100';
}

/** Días hábiles válidos para calcular la fecha fin — entero ≥ 1, o `null`. */
function parseDays(value: string): number | null {
  const days = Number(value);
  return value.trim() && Number.isInteger(days) && days >= 1 ? days : null;
}

export interface ExecutionSegmentModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Equipos ya asignados al proyecto (no el catálogo completo) — mismo criterio que `DeliveryModal`. */
  teamOptions: Array<{ value: string; label: string }>;
  initialValues: ExecutionSegmentModalValues;
  /** Tramo que se está editando — sus horas actuales no se cuentan como carga existente al avisar sobrecargas. */
  segmentId?: string | null;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (values: ExecutionSegmentModalValues) => void;
}

/**
 * Modal "Nuevo tiempo de ejecución" / "Editar tiempo de ejecución" — un tramo
 * de trabajo de un equipo dentro de una fase, con su propio rango de fechas.
 * Alimenta las barras del Roadmap (vista semanal/días) — ver
 * `projectModuleSegmentSchema`. Mismos campos y validación que el prototipo
 * HTML de referencia, más los colaboradores (opcionales) del equipo: los que
 * tienen % diario cargan sus HH semanales en el Forecast al guardar el tramo.
 */
export function ExecutionSegmentModal({
  open,
  mode,
  teamOptions,
  initialValues,
  segmentId = null,
  submitting,
  onCancel,
  onConfirm,
}: ExecutionSegmentModalProps) {
  const [values, setValues] = useState<ExecutionSegmentModalValues>(initialValues);
  /** Texto del campo "Días hábiles" mientras se escribe — `null` = se deriva de las fechas. */
  const [daysText, setDaysText] = useState<string | null>(null);
  const { data: team, isLoading: loadingTeam } = useTeamDetail(open && values.teamId ? values.teamId : null);
  /** Catálogo completo (unas decenas de filas): el rango del tramo cambia mientras se edita. */
  const { data: holidays } = useHolidays({});
  const holidayDates = useMemo(() => new Set((holidays ?? []).map((holiday) => holiday.date)), [holidays]);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setDaysText(null);
    }
  }, [open, initialValues]);

  const weekdays = countBusinessDays(values.startDate, values.endDate, holidayDates);
  const daysValue = daysText ?? (weekdays > 0 ? String(weekdays) : '');

  /** Con inicio y días hábiles, la fecha fin se calcula saltando fines de semana y feriados. */
  const changeDays = (text: string) => {
    setDaysText(text);
    const days = parseDays(text);
    if (days !== null && values.startDate) {
      setValues((prev) => ({ ...prev, endDate: addBusinessDays(prev.startDate, days, holidayDates) }));
    }
  };

  /** Al mover el inicio se conserva la duración en días hábiles y se corre la fecha fin. */
  const changeStartDate = (startDate: string) => {
    const days = parseDays(daysValue);
    setValues((prev) => ({
      ...prev,
      startDate,
      endDate: startDate && days !== null ? addBusinessDays(startDate, days, holidayDates) : prev.endDate,
    }));
  };

  const changeEndDate = (endDate: string) => {
    setDaysText(null);
    setValues((prev) => ({ ...prev, endDate }));
  };
  const weeklyHoursByMember = new Map((team?.members ?? []).map((member) => [member.id, member.weeklyHours]));
  const selectedIds = new Set(values.members.map((member) => member.teamMemberId));
  const memberOptions = (team?.members ?? [])
    .filter((member) => !selectedIds.has(member.id) && member.userStatus !== 'disabled' && isForecastAssignableRole(member.userRole))
    .map((member) => ({ value: member.id, label: member.fullName }));

  const canSubmit = Boolean(
    values.teamId &&
      values.name.trim() &&
      values.startDate &&
      values.endDate &&
      values.startDate <= values.endDate &&
      values.members.every((member) => !percentError(member.dailyPercent)),
  );

  const addMember = (teamMemberId: string) => {
    const member = team?.members.find((m) => m.id === teamMemberId);
    if (!member) return;
    setValues((prev) => ({
      ...prev,
      members: [...prev.members, { teamMemberId: member.id, fullName: member.fullName, dailyPercent: '' }],
    }));
  };

  const setMemberPercent = (teamMemberId: string, dailyPercent: string) =>
    setValues((prev) => ({
      ...prev,
      members: prev.members.map((member) => (member.teamMemberId === teamMemberId ? { ...member, dailyPercent } : member)),
    }));

  const removeMember = (teamMemberId: string) =>
    setValues((prev) => ({ ...prev, members: prev.members.filter((member) => member.teamMemberId !== teamMemberId) }));

  // Solo los colaboradores con % válido cargan HH: con ellos se pregunta si alguien queda sobre el 100 %.
  const loadedMembers = values.members
    .filter((member) => member.dailyPercent.trim() && !percentError(member.dailyPercent))
    .map((member) => ({ teamMemberId: member.teamMemberId, dailyPercent: Number(member.dailyPercent) }));
  const previewInput =
    open && values.startDate && values.endDate && values.startDate <= values.endDate && loadedMembers.length > 0
      ? { kind: 'segment' as const, segmentId, startDate: values.startDate, endDate: values.endDate, members: loadedMembers }
      : null;
  const { data: loadPreview } = useForecastLoadPreview(previewInput);
  const checkOverload = useCheckForecastOverload();
  const [checking, setChecking] = useState(false);
  const [overloadToConfirm, setOverloadToConfirm] = useState<ForecastOverloadWarning[] | null>(null);

  /** Si alguien queda sobre el 100 %, se pide confirmar antes de guardar. */
  const handleSave = async () => {
    setChecking(true);
    const warnings = await checkOverload(previewInput);
    setChecking(false);
    if (warnings.length > 0) setOverloadToConfirm(warnings);
    else onConfirm(values);
  };

  const estimatedHours = (member: ExecutionSegmentMemberValue): number | null => {
    const weeklyHours = weeklyHoursByMember.get(member.teamMemberId);
    if (percentError(member.dailyPercent) || !member.dailyPercent.trim() || weeklyHours === undefined || weekdays === 0) {
      return null;
    }
    return Math.round(weekdays * (weeklyHours / 5) * (Number(member.dailyPercent) / 100) * 10) / 10;
  };

  return (
    <>
    <Modal
      open={open}
      title={mode === 'edit' ? 'Editar tiempo de ejecución' : 'Nuevo tiempo de ejecución'}
      description="Cuándo trabaja cada equipo en esta Fase/Módulo. Alimenta el Roadmap (vista semanal, tipo carta Gantt)."
      onClose={onCancel}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSubmit} loading={submitting || checking} loadingText="Guardando…">
            Guardar
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Select
          label="Equipo"
          placeholder="Selecciona un equipo"
          options={teamOptions}
          value={values.teamId}
          // Los colaboradores son del equipo: si cambia el equipo, los elegidos dejan de aplicar.
          onChange={(event) => setValues((prev) => ({ ...prev, teamId: event.target.value, members: [] }))}
        />
        <TextField
          label="Nombre del tramo"
          placeholder="Ej. UX research, UI diseño, Front-Back"
          value={values.name}
          onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
        />
        <div className={segmentStyles.dates}>
          <TextField
            label="Fecha inicio"
            type="date"
            value={values.startDate}
            onChange={(event) => changeStartDate(event.target.value)}
          />
          <TextField
            label="Días hábiles"
            type="number"
            min={1}
            step={1}
            placeholder="Ej. 10"
            value={daysValue}
            errorText={daysValue.trim() && parseDays(daysValue) === null ? 'Entero ≥ 1' : undefined}
            onChange={(event) => changeDays(event.target.value)}
          />
          <TextField
            label="Fecha fin"
            type="date"
            value={values.endDate}
            onChange={(event) => changeEndDate(event.target.value)}
          />
        </div>

        <div className={segmentStyles.members}>
          <div className={styles.subsectionHead}>
            <span className={styles.subsectionLabel}>Colaboradores (opcional)</span>
          </div>
          <p className={segmentStyles.hint}>
            Con el % de su jornada diaria, el tramo carga sus HH semanales en el Forecast. Se recalculan cada vez que
            guardas el tramo; si el líder de equipo las ajustó a mano, su ajuste se mantiene.
          </p>

          {values.members.map((member) => {
            const error = percentError(member.dailyPercent);
            const hours = estimatedHours(member);
            return (
              <div key={member.teamMemberId} className={segmentStyles.memberRow}>
                <div className={styles.listInfo}>
                  <span className={styles.listName}>{member.fullName}</span>
                  <span className={styles.listMeta}>
                    {hours !== null ? `≈ ${hours.toLocaleString('es-CL')} HH en el tramo` : 'Sin % — no carga HH al Forecast'}
                  </span>
                </div>
                <TextField
                  className={segmentStyles.percentField}
                  aria-label={`% diario de ${member.fullName}`}
                  type="number"
                  min={1}
                  max={100}
                  step={5}
                  placeholder="% diario"
                  iconRight={<span className={segmentStyles.percentSuffix}>%</span>}
                  value={member.dailyPercent}
                  errorText={error}
                  onChange={(event) => setMemberPercent(member.teamMemberId, event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={styles.listDeleteButton}
                  onClick={() => removeMember(member.teamMemberId)}
                  aria-label={`Quitar a ${member.fullName}`}
                >
                  <CloseIcon size={14} />
                </Button>
              </div>
            );
          })}

          <Combobox
            placeholder={
              !values.teamId
                ? 'Primero selecciona un equipo'
                : loadingTeam
                  ? 'Cargando colaboradores…'
                  : 'Agregar colaborador del equipo'
            }
            options={memberOptions}
            value=""
            onChange={addMember}
            disabled={!values.teamId || loadingTeam}
            emptyMessage={team && team.members.length === values.members.length ? 'Ya agregaste a todo el equipo.' : 'Sin resultados.'}
          />

          <ForecastOverloadAlert warnings={previewInput ? loadPreview?.warnings : undefined} sourceLabel="este tramo" />
        </div>
      </div>
    </Modal>

    <ConfirmActionDialog
      open={overloadToConfirm !== null}
      title="¿Guardar igual?"
      description={overloadToConfirm ? summarizeOverload(overloadToConfirm) : ''}
      confirmLabel="Guardar igual"
      onConfirm={async () => onConfirm(values)}
      onClose={() => setOverloadToConfirm(null)}
    />
    </>
  );
}
