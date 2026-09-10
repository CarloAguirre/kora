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
import { AlertIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useCreateHourEntry, useHolidays, useHourEntriesList } from '../api/hours.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';

/** Mismo orden que "Seleccionar asignación..." en `RegistroHHModal` (v1) — Proyecto no va primero. */
const ASSIGNMENT_OPTIONS = [...HOUR_ENTRY_ASSIGNMENTS]
  .sort((a, b) => (a === 'Proyecto' ? 1 : b === 'Proyecto' ? -1 : 0))
  .map((value) => ({ value, label: value }));
const DAILY_CAP_HOURS = 8;
const MIN_DESCRIPTION_LENGTH = 5;
const HOURS_STEP = 0.5;
const today = () => new Date().toISOString().slice(0, 10);
const isWeekend = (isoDate: string) => {
  const day = new Date(`${isoDate}T00:00:00`).getDay();
  return day === 0 || day === 6;
};

interface DailyBlock {
  key: string;
  expanded: boolean;
  assignment: HourEntryAssignment | '';
  projectId: string;
  category: string;
  hours: string;
  description: string;
  isOvertime: boolean;
  designatedApproverUserId: string;
}

let blockCounter = 0;
const createEmptyBlock = (): DailyBlock => ({
  key: `block-${(blockCounter += 1)}`,
  expanded: true,
  assignment: '',
  projectId: '',
  category: '',
  hours: '',
  description: '',
  isOvertime: false,
  designatedApproverUserId: '',
});

/**
 * Registro diario — un mismo día, varios registros en un solo envío.
 * Equivalente a la pestaña "Registro diario" de `RegistroHHModal` en la v1
 * (bloques agregables); cada bloque se guarda como un `hour_entries`
 * independiente. Marcar "Horas Extra" deja el registro `pending` y exige
 * aprobador cuando no hay proyecto (el backend siempre lo exige, ver
 * `HourEntry.create`).
 */
export function DailyEntryForm({
  onClose,
  onSuccess,
  onTotalChange,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Notifica al diálogo contenedor el total de horas del día (para el contador junto al cierre). */
  onTotalChange?: (total: number) => void;
}) {
  const { user } = useAuth();
  const createEntry = useCreateHourEntry();
  const { data: projects } = useProjectsList({ page: 1, pageSize: 200, sortField: 'name' });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });

  const [date, setDate] = useState(today());
  const [blocks, setBlocks] = useState<DailyBlock[]>([createEmptyBlock()]);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: holidaysForDate } = useHolidays({ dateFrom: date, dateTo: date });
  const { data: entriesForDate } = useHourEntriesList(user ? { userId: user.id, dateFrom: date, dateTo: date, pageSize: 100 } : {});
  const existingHoursForDate = (entriesForDate?.items ?? [])
    .filter((e) => e.status !== 'rejected')
    .reduce((sum, e) => sum + e.hours, 0);
  const holiday = holidaysForDate?.[0] ?? null;
  const weekend = isWeekend(date);
  const blockingMessage = weekend
    ? 'No se puede registrar horas en fines de semana.'
    : holiday
      ? `No se puede registrar horas el ${holiday.name} (feriado).`
      : null;

  const updateBlock = (key: string, patch: Partial<DailyBlock>) => {
    setBlocks((prev) => prev.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  };

  const addBlock = () =>
    setBlocks((prev) => [...prev.map((block) => ({ ...block, expanded: false })), createEmptyBlock()]);
  const removeBlock = (key: string) => setBlocks((prev) => (prev.length > 1 ? prev.filter((block) => block.key !== key) : prev));
  const toggleExpand = (key: string) =>
    setBlocks((prev) => prev.map((block) => (block.key === key ? { ...block, expanded: !block.expanded } : block)));
  const blockTitle = (block: DailyBlock, index: number) => {
    const project = (projects?.items ?? []).find((p) => p.id === block.projectId);
    return project?.name ?? `Registro ${index + 1}`;
  };
  const adjustHours = (key: string, delta: number) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.key !== key) return block;
        const next = Math.max(0, Math.round(((Number(block.hours) || 0) + delta) * 100) / 100);
        return { ...block, hours: next === 0 ? '' : String(next) };
      }),
    );
  };

  const dailyTotal = blocks.reduce((sum, block) => sum + (Number(block.hours) || 0), 0);
  const totalWithExisting = existingHoursForDate + dailyTotal;

  useEffect(() => {
    onTotalChange?.(totalWithExisting);
  }, [totalWithExisting, onTotalChange]);

  const validateBlock = (block: DailyBlock): string | null => {
    if (!block.assignment) return 'Selecciona una asignación.';
    const hours = Number(block.hours);
    if (!block.hours || Number.isNaN(hours) || hours <= 0) return 'Ingresa horas mayores a 0.';
    if (hours > 24) return 'No puede registrar más de 24 horas en un día.';
    const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment);
    if (needsProject && !block.projectId) return 'Selecciona un proyecto para esta asignación.';
    // Horas de proyecto se aprueban por acceso al proyecto, no por aprobador
    // designado (docs/DECISION-M4-HORAS.md) — el backend rechaza ambos a la vez.
    const needsApprover = !needsProject && (user?.role === 'collaborator' || block.isOvertime);
    if (needsApprover && !block.designatedApproverUserId) return 'Selecciona a quién aprueba estas horas.';
    if (block.description.trim().length > 0 && block.description.trim().length < MIN_DESCRIPTION_LENGTH) {
      return `La descripción debe tener al menos ${MIN_DESCRIPTION_LENGTH} caracteres.`;
    }
    return null;
  };

  const onSubmit = async () => {
    setServerError(null);
    if (blockingMessage) return;
    const nextErrors: Record<string, string> = {};
    for (const block of blocks) {
      const error = validateBlock(block);
      if (error) nextErrors[block.key] = error;
    }
    setBlockErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const remaining = [...blocks];
    try {
      while (remaining.length > 0) {
        const block = remaining[0]!;
        const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment as HourEntryAssignment);
        const input: CreateHourEntryInput = {
          assignment: block.assignment as HourEntryAssignment,
          projectId: needsProject ? block.projectId : undefined,
          category: block.category || undefined,
          description: block.description || undefined,
          hours: Number(block.hours),
          date,
          isOvertime: block.isOvertime,
          designatedApproverUserId: block.designatedApproverUserId || undefined,
        };
        await createEntry.mutateAsync(input);
        remaining.shift();
        setBlocks([...remaining.length > 0 ? remaining : [createEmptyBlock()]]);
      }
      onSuccess(blocks.length > 1 ? `Se registraron ${blocks.length} entradas de horas.` : 'Se registraron las horas.');
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo guardar el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <p className={styles.formSubtitle}>Agrega uno o más registros y registra tus horas del día</p>

      {serverError && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{serverError}</span>
        </div>
      )}

      <TextField label="Fecha de registro" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />

      {!blockingMessage && existingHoursForDate > 0 && existingHoursForDate < DAILY_CAP_HOURS && (
        <div className={styles.noticeInfo} role="status">
          <AlertIcon size={16} />
          <span>
            Ya tienes {existingHoursForDate.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h registradas este día. Al
            superar {DAILY_CAP_HOURS}h, considera marcar horas extra.
          </span>
        </div>
      )}

      {!blockingMessage && totalWithExisting > DAILY_CAP_HOURS && (
        <div className={styles.noticeWarning} role="status">
          <AlertIcon size={16} />
          <span>
            Estás superando el límite diario de {DAILY_CAP_HOURS}h. Este registro dejará el día con{' '}
            {totalWithExisting.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h en total.
          </span>
        </div>
      )}

      {blockingMessage && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{blockingMessage}</span>
        </div>
      )}

      {blocks.map((block, index) => {
        const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment as HourEntryAssignment);
        const showApproverInRow =
          block.assignment !== '' && !needsProject && (user?.role === 'collaborator' || block.isOvertime);
        return (
          <div key={block.key} className={styles.block}>
            <div
              className={[styles.blockHeader, block.expanded ? styles.blockHeaderExpanded : ''].join(' ')}
              role="button"
              tabIndex={0}
              onClick={() => toggleExpand(block.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleExpand(block.key);
                }
              }}
            >
              {block.expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
              <span className={styles.blockTitle}>{blockTitle(block, index)}</span>
              {blocks.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeBlock(block.key);
                  }}
                  aria-label="Quitar registro"
                >
                  <TrashIcon size={16} />
                </Button>
              )}
            </div>

            {block.expanded && (
              <div className={styles.blockBody}>
                <div className={styles.row}>
                  <Select
                    label="Asignación"
                    required
                    placeholder="Seleccionar asignación..."
                    options={ASSIGNMENT_OPTIONS}
                    value={block.assignment}
                    onChange={(event) => {
                      const needsProjectNext = PROJECT_REQUIRING_ASSIGNMENTS.has(event.target.value);
                      updateBlock(block.key, {
                        assignment: event.target.value as HourEntryAssignment,
                        projectId: needsProjectNext ? block.projectId : '',
                        designatedApproverUserId: needsProjectNext ? '' : block.designatedApproverUserId,
                      });
                    }}
                  />
                  {showApproverInRow ? (
                    <Select
                      label="Líder aprobador"
                      required
                      placeholder="Selecciona a quién aprueba estas horas"
                      options={(leaders?.items ?? []).map((leader) => ({ value: leader.id, label: leader.fullName }))}
                      value={block.designatedApproverUserId}
                      onChange={(event) => updateBlock(block.key, { designatedApproverUserId: event.target.value })}
                    />
                  ) : (
                    <Select
                      label="Proyecto"
                      required={needsProject}
                      disabled={!needsProject}
                      placeholder="Seleccionar proyecto..."
                      options={(projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
                      value={block.projectId}
                      onChange={(event) => updateBlock(block.key, { projectId: event.target.value })}
                    />
                  )}
                </div>

                <TextField
                  label="Actividad"
                  placeholder="Ej: Diseño de wireframes de alta fidelidad para módulo dashboard"
                  value={block.category}
                  onChange={(event) => updateBlock(block.key, { category: event.target.value })}
                />

                <div className={styles.row}>
                  <div className={styles.stepperField}>
                    <span className={styles.stepperLabel}>Horas Trabajadas</span>
                    <div className={styles.stepper}>
                      <button type="button" className={styles.stepperButton} onClick={() => adjustHours(block.key, -HOURS_STEP)}>
                        −
                      </button>
                      <input
                        className={styles.stepperInput}
                        type="number"
                        step={HOURS_STEP}
                        min={0}
                        value={block.hours}
                        onChange={(event) => updateBlock(block.key, { hours: event.target.value })}
                      />
                      <button type="button" className={styles.stepperButton} onClick={() => adjustHours(block.key, HOURS_STEP)}>
                        +
                      </button>
                    </div>
                  </div>

                  <div className={styles.overtimeField}>
                    <span className={styles.stepperLabel}>Horas Extra</span>
                    <label className={styles.overtimeToggleRow}>
                      <input
                        type="checkbox"
                        className={styles.overtimeCheckbox}
                        checked={block.isOvertime}
                        onChange={(event) => updateBlock(block.key, { isOvertime: event.target.checked })}
                      />
                      <span className={styles.overtimeSwitch} aria-hidden="true" />
                      <span className={styles.overtimeState}>{block.isOvertime ? 'Marcada' : 'No marcada'}</span>
                    </label>
                    {block.isOvertime && (
                      <span className={styles.overtimeHelp}>
                        {needsProject
                          ? 'Quedará pendiente de aprobación del líder del proyecto.'
                          : 'Quedará pendiente de aprobación del líder que selecciones.'}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.textareaField}>
                  <label className={styles.textareaLabel}>Descripción / Bitácora Detallada</label>
                  <textarea
                    className={styles.textarea}
                    placeholder="Describa detalladamente el avance técnico realizado (mínimo 5 caracteres)"
                    value={block.description}
                    onChange={(event) => updateBlock(block.key, { description: event.target.value })}
                  />
                </div>

                {blockErrors[block.key] && (
                  <span className={styles.blockError} role="alert">
                    {blockErrors[block.key]}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className={styles.addBlockButton} onClick={addBlock}>
        <PlusIcon size={16} />
        Agregar otro registro
      </button>

      <div className={styles.dailyTotal}>
        Total del día: <strong>{dailyTotal.toLocaleString('es-CL', { maximumFractionDigits: 1 })} horas</strong>
      </div>

      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" disabled={Boolean(blockingMessage)} loading={submitting} loadingText="Guardando…" onClick={() => void onSubmit()}>
          Guardar y enviar para aprobación
        </Button>
      </div>
    </div>
  );
}
