import { useEffect, useState } from 'react';
import {
  HOUR_ENTRY_ASSIGNMENTS,
  PROJECT_REQUIRING_ASSIGNMENTS,
  type CreateHourEntryInput,
  type HourEntryAssignment,
} from '@kora/contracts';
import styles from './HourEntryFormDialog.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from '@/shared/components/icons/Icons';
import { useCreateHourEntry, useHolidays, useHourEntriesList } from '../api/hours.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { getProjectOptionLabel } from '@/modules/projects/lib/project-option-label';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { HOUR_ENTRY_PROJECT_STATUSES } from '../lib/selectable-project-statuses';
import { ApiRequestError } from '@/shared/lib/api-client';

/** Proyecto primero: es la asignación más común y el resto confundía al elegir. */
const ASSIGNMENT_OPTIONS = [...HOUR_ENTRY_ASSIGNMENTS]
  .sort((a, b) => (a === 'Proyecto' ? -1 : b === 'Proyecto' ? 1 : 0))
  .map((value) => ({ value, label: value }));
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const WEEKLY_CAP_HOURS = 40;
const DAILY_CAP_HOURS = 8;
const MIN_DESCRIPTION_LENGTH = 5;

function mondayOf(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatRange(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const fmt = (d: Date) => `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
  return `${fmt(monday)} – ${fmt(friday)} ${friday.getFullYear()}`;
}

/**
 * Registro semanal — un proyecto/asignación, horas lunes a viernes en un
 * envío. Equivalente a la pestaña "Registro semanal" de `RegistroHHModal` en
 * la v1; cada día con horas &gt; 0 se guarda como un `hour_entries`
 * independiente para esa fecha.
 */
export function WeeklyEntryForm({
  onClose,
  onSuccess,
  onTotalChange,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Notifica al diálogo contenedor el total de horas de la semana (para el contador junto al cierre). */
  onTotalChange?: (total: number) => void;
}) {
  const { user } = useAuth();
  const createEntry = useCreateHourEntry();
  // El PMO puede registrar horas en cualquier proyecto; el resto solo en los que tiene asignados.
  // Todos los proyectos salvo los finalizados.
  const { data: projects } = useProjectsList({
    page: 1,
    pageSize: 200,
    sortField: 'name',
    assignedToUserId: user?.role === 'pmo' ? undefined : user?.id,
    status: HOUR_ENTRY_PROJECT_STATUSES,
  });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });

  const [monday, setMonday] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  const [assignment, setAssignment] = useState<HourEntryAssignment | ''>('');
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [designatedApproverUserId, setDesignatedApproverUserId] = useState('');
  const [isOvertime, setIsOvertime] = useState(false);
  const [dayHours, setDayHours] = useState<string[]>(['', '', '', '', '']);
  const [autoFill, setAutoFill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(assignment as HourEntryAssignment);
  // Horas de proyecto se aprueban por acceso al proyecto, no por aprobador
  // designado (docs/DECISION-M4-HORAS.md) — el backend rechaza ambos a la vez.
  const needsApprover = !needsProject && assignment !== '' && (user?.role === 'collaborator' || isOvertime);
  const showApproverInRow = needsApprover;
  const selectedProject = needsProject ? (projects?.items ?? []).find((p) => p.id === projectId) : undefined;
  const overtimeDisabled = needsProject && !selectedProject?.allowsOvertime;
  const weekTotal = dayHours.reduce((sum, value) => sum + (Number(value) || 0), 0);

  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const weekStartIso = toIsoDate(monday);
  const weekEndIso = toIsoDate(friday);

  const { data: holidaysThisWeek } = useHolidays({ dateFrom: weekStartIso, dateTo: weekEndIso });
  const { data: entriesThisWeek } = useHourEntriesList(
    user ? { userId: user.id, dateFrom: weekStartIso, dateTo: weekEndIso, pageSize: 100 } : {},
  );
  const existingWeekHours = (entriesThisWeek?.items ?? [])
    .filter((e) => e.status !== 'rejected')
    .reduce((sum, e) => sum + e.hours, 0);
  const holidayDayIndexes = new Set(
    (holidaysThisWeek ?? []).map((h) => Math.round((new Date(`${h.date}T00:00:00`).getTime() - monday.getTime()) / 86_400_000)),
  );
  const totalWeekWithExisting = existingWeekHours + weekTotal;

  useEffect(() => {
    onTotalChange?.(totalWeekWithExisting);
  }, [totalWeekWithExisting, onTotalChange]);

  const shiftWeek = (deltaDays: number) => {
    const next = new Date(monday);
    next.setDate(next.getDate() + deltaDays);
    setMonday(next);
  };

  const applyAutoFill = (checked: boolean) => {
    setAutoFill(checked);
    if (!checked) {
      setDayHours(['', '', '', '', '']);
      return;
    }
    let remaining = Math.max(0, WEEKLY_CAP_HOURS - existingWeekHours);
    setDayHours(
      WEEKDAY_LABELS.map((_, index) => {
        if (holidayDayIndexes.has(index)) return '';
        const fill = Math.min(DAILY_CAP_HOURS, remaining);
        remaining -= fill;
        return fill > 0 ? String(fill) : '';
      }),
    );
  };

  const validate = (): string | null => {
    if (!assignment) return 'Selecciona una asignación.';
    const activeDays = dayHours.map((value, index) => ({ index, hours: Number(value) })).filter((day) => day.hours > 0);
    if (activeDays.length === 0) return 'Ingresa horas en al menos un día.';
    if (activeDays.some((day) => day.hours > 24)) return 'No puede registrar más de 24 horas en un día.';
    if (activeDays.some((day) => holidayDayIndexes.has(day.index))) return 'No se pueden registrar horas en un día feriado.';
    if (needsProject && !projectId) return 'Selecciona un proyecto para esta asignación.';
    if (needsApprover && !designatedApproverUserId) return 'Selecciona a quién aprueba estas horas.';
    if (needsProject && isOvertime && overtimeDisabled) return 'Este proyecto no tiene autorizadas horas extra.';
    if (!category.trim()) return 'Indica la actividad realizada.';
    if (description.trim().length > 0 && description.trim().length < MIN_DESCRIPTION_LENGTH) {
      return `La descripción debe tener al menos ${MIN_DESCRIPTION_LENGTH} caracteres.`;
    }
    return null;
  };

  const canSubmit = validate() === null;

  const onSubmit = async () => {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const activeDays = dayHours
      .map((value, index) => ({ index, hours: Number(value) }))
      .filter((day) => day.hours > 0);

    setSubmitting(true);
    try {
      for (const day of activeDays) {
        const date = new Date(monday);
        date.setDate(date.getDate() + day.index);
        const input: CreateHourEntryInput = {
          assignment: assignment as HourEntryAssignment,
          projectId: needsProject ? projectId : undefined,
          category: category.trim(),
          description: description || undefined,
          hours: day.hours,
          date: toIsoDate(date),
          isOvertime,
          designatedApproverUserId: designatedApproverUserId || undefined,
          hasBlocker: false,
        };
        await createEntry.mutateAsync(input);
      }
      onSuccess(`Se registraron ${activeDays.length} días de horas.`);
    } catch (submitError) {
      setError(submitError instanceof ApiRequestError ? submitError.message : 'No se pudo guardar el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <p className={styles.formSubtitle}>Registra tus horas por día y se suman automáticamente</p>

      {error && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.weekSummaryRow}>
        <span className={styles.weekSummaryLabel}>
          Asignación: <strong className={styles.weekSummaryValue}>{assignment || 'Selecciona'}</strong>
        </span>
        <div className={styles.weekNav}>
          <Button variant="ghost" size="icon" type="button" onClick={() => shiftWeek(-7)} aria-label="Semana anterior">
            <ChevronLeftIcon size={16} />
          </Button>
          <span className={styles.weekRange}>{formatRange(monday)}</span>
          <Button variant="ghost" size="icon" type="button" onClick={() => shiftWeek(7)} aria-label="Semana siguiente">
            <ChevronRightIcon size={16} />
          </Button>
        </div>
      </div>

      {holidayDayIndexes.size > 0 && (
        <div className={styles.noticeWarning} role="status">
          <AlertIcon size={16} />
          <span>Esta semana contiene feriado(s) en Chile. No se podrán registrar horas en esos días.</span>
        </div>
      )}

      <div className={styles.row}>
        <Select
          label="Asignación"
          required
          placeholder="Seleccionar asignación..."
          options={ASSIGNMENT_OPTIONS}
          value={assignment}
          onChange={(event) => {
            const next = event.target.value as HourEntryAssignment;
            setAssignment(next);
            if (PROJECT_REQUIRING_ASSIGNMENTS.has(next)) {
              setDesignatedApproverUserId('');
            } else {
              setProjectId('');
            }
          }}
        />
        {showApproverInRow ? (
          <Select
            label="Líder aprobador"
            required
            placeholder="Selecciona a quién aprueba estas horas"
            options={(leaders?.items ?? []).map((leader) => ({ value: leader.id, label: leader.fullName }))}
            value={designatedApproverUserId}
            onChange={(event) => setDesignatedApproverUserId(event.target.value)}
          />
        ) : (
          <Combobox
            label="Proyecto"
            disabled={!needsProject}
            placeholder="Buscar proyecto..."
            options={(projects?.items ?? []).map((project) => ({ value: project.id, label: getProjectOptionLabel(project) }))}
            value={projectId}
            onChange={(nextProjectId) => {
              const nextProject = (projects?.items ?? []).find((p) => p.id === nextProjectId);
              setProjectId(nextProjectId);
              if (!nextProject?.allowsOvertime) setIsOvertime(false);
            }}
          />
        )}
      </div>

      <div className={styles.row}>
        <TextField label="Actividad" required placeholder="Ej: Diseño webapp" value={category} onChange={(event) => setCategory(event.target.value)} />
        <div className={styles.overtimeField}>
          <span className={styles.stepperLabel}>Horas Extra</span>
          <label
            className={styles.overtimeToggleRow}
            title={overtimeDisabled ? 'Este proyecto no tiene autorizadas horas extra.' : undefined}
          >
            <input
              type="checkbox"
              className={styles.overtimeCheckbox}
              disabled={overtimeDisabled}
              checked={isOvertime}
              onChange={(event) => setIsOvertime(event.target.checked)}
            />
            <span className={styles.overtimeSwitch} aria-hidden="true" />
            <span className={styles.overtimeState}>{isOvertime ? 'Marcada' : 'No marcada'}</span>
          </label>
          {isOvertime ? (
            <span className={styles.overtimeHelp}>
              {needsProject
                ? 'Quedará pendiente de aprobación del líder del proyecto.'
                : 'Quedará pendiente de aprobación del líder que selecciones.'}
            </span>
          ) : (
            needsProject &&
            projectId &&
            overtimeDisabled && <span className={styles.overtimeHelp}>Este proyecto no tiene autorizadas horas extra.</span>
          )}
        </div>
      </div>

      <div className={styles.hoursGridHeader}>
        <span className={styles.stepperLabel}>Horas por día</span>
        <label className={styles.autoFillToggle}>
          <input type="checkbox" checked={autoFill} onChange={(event) => applyAutoFill(event.target.checked)} />
          <span>Llenar 8h automáticamente</span>
        </label>
      </div>

      <div className={styles.weekGrid}>
        {WEEKDAY_LABELS.map((label, index) => (
          <TextField
            key={label}
            label={label}
            type="number"
            step="0.25"
            disabled={holidayDayIndexes.has(index)}
            value={holidayDayIndexes.has(index) ? '' : dayHours[index]}
            onChange={(event) =>
              setDayHours((prev) => prev.map((value, valueIndex) => (valueIndex === index ? event.target.value : value)))
            }
          />
        ))}
      </div>

      <div className={styles.totalBar}>
        <span>Total semanal</span>
        <strong className={totalWeekWithExisting > WEEKLY_CAP_HOURS ? styles.overCapValue : undefined}>
          {totalWeekWithExisting.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h / {WEEKLY_CAP_HOURS}h
        </strong>
      </div>

      {existingWeekHours > 0 && (
        <div className={totalWeekWithExisting >= WEEKLY_CAP_HOURS ? styles.noticeWarning : styles.noticeInfo} role="status">
          <AlertIcon size={16} />
          <span>Ya tienes {existingWeekHours.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h registradas en esta semana.</span>
        </div>
      )}

      <div className={styles.textareaField}>
        <label className={styles.textareaLabel}>Descripción / Bitácora Detallada</label>
        <textarea
          className={styles.textarea}
          placeholder="Describa detalladamente el avance técnico realizado (mínimo 5 caracteres)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" disabled={!canSubmit} loading={submitting} loadingText="Guardando…" onClick={() => void onSubmit()}>
          Guardar semana y enviar para aprobación
        </Button>
      </div>
    </div>
  );
}
