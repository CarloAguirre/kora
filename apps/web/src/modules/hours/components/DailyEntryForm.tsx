import { useEffect, useState } from 'react';
import {
  HOUR_ENTRY_ASSIGNMENTS,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_REQUIRING_ASSIGNMENTS,
  type CreateHourEntryInput,
  type HourEntryAssignment,
  type ProjectSummary,
} from '@kora/contracts';
import styles from './HourEntryFormDialog.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { AlertIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useCreateHourEntry, useHolidays, useHourEntriesList } from '../api/hours.queries';
import { useProjectDetail, useProjectsList } from '@/modules/projects/api/projects.queries';
import { getProjectOptionLabel } from '@/modules/projects/lib/project-option-label';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';

/** Proyecto primero: es la asignación más común y el resto confundía al elegir. */
const ASSIGNMENT_OPTIONS = [...HOUR_ENTRY_ASSIGNMENTS]
  .sort((a, b) => (a === 'Proyecto' ? -1 : b === 'Proyecto' ? 1 : 0))
  .map((value) => ({ value, label: value }));
export const DAILY_CAP_HOURS = 8;
const MIN_DESCRIPTION_LENGTH = 5;
const HOURS_STEP = 0.25;
const today = () => new Date().toISOString().slice(0, 10);
export const isWeekend = (isoDate: string) => {
  const day = new Date(`${isoDate}T00:00:00`).getDay();
  return day === 0 || day === 6;
};

export interface DailyBlock {
  key: string;
  expanded: boolean;
  assignment: HourEntryAssignment | '';
  projectId: string;
  moduleId: string;
  category: string;
  hours: string;
  description: string;
  isOvertime: boolean;
  designatedApproverUserId: string;
  hasBlocker: boolean;
  blockerDescription: string;
}

let blockCounter = 0;
const createEmptyBlock = (): DailyBlock => ({
  key: `block-${(blockCounter += 1)}`,
  expanded: true,
  assignment: '',
  projectId: '',
  moduleId: '',
  category: '',
  hours: '',
  description: '',
  isOvertime: false,
  designatedApproverUserId: '',
  hasBlocker: false,
  blockerDescription: '',
});

/** Ajusta las horas de un bloque con el stepper (−/+), sin bajar de 0. */
export const stepBlockHours = (hours: string, delta: number) => {
  const next = Math.max(0, Math.round(((Number(hours) || 0) + delta) * 100) / 100);
  return next === 0 ? '' : String(next);
};

/**
 * Reglas de un bloque compartidas por el alta (`DailyEntryForm`) y la edición
 * (`HourEntryFormDialog`). `overtimeAlreadyGranted` cubre registros que ya
 * nacieron como horas extra en un proyecto que no las autoriza (p. ej. el
 * excedente de una solicitud de HH de ticket): el backend permite conservarlos.
 */
export function validateDailyBlock(
  block: DailyBlock,
  {
    projects,
    isCollaborator,
    overtimeAlreadyGranted = false,
  }: { projects: ProjectSummary[]; isCollaborator: boolean; overtimeAlreadyGranted?: boolean },
): string | null {
  if (!block.assignment) return 'Selecciona una asignación.';
  const hours = Number(block.hours);
  if (!block.hours || Number.isNaN(hours) || hours <= 0) return 'Ingresa horas mayores a 0.';
  if (hours > 24) return 'No puede registrar más de 24 horas en un día.';
  const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment);
  if (needsProject && !block.projectId) return 'Selecciona un proyecto para esta asignación.';
  if (needsProject && block.isOvertime && !overtimeAlreadyGranted) {
    const project = projects.find((p) => p.id === block.projectId);
    if (!project?.allowsOvertime) return 'Este proyecto no tiene autorizadas horas extra.';
  }
  // Horas de proyecto se aprueban por acceso al proyecto, no por aprobador
  // designado (docs/DECISION-M4-HORAS.md) — el backend rechaza ambos a la vez.
  const needsApprover = !needsProject && (isCollaborator || block.isOvertime);
  if (needsApprover && !block.designatedApproverUserId) return 'Selecciona a quién aprueba estas horas.';
  if (!block.category.trim()) return 'Indica la actividad realizada.';
  if (block.description.trim().length > 0 && block.description.trim().length < MIN_DESCRIPTION_LENGTH) {
    return `La descripción debe tener al menos ${MIN_DESCRIPTION_LENGTH} caracteres.`;
  }
  if (block.hasBlocker && !block.blockerDescription.trim()) return 'Describe el bloqueo reportado.';
  return null;
}

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
  // El PMO puede registrar horas en cualquier proyecto; el resto solo en los que tiene asignados.
  const { data: projects } = useProjectsList({
    page: 1,
    pageSize: 200,
    sortField: 'name',
    assignedToUserId: user?.role === 'pmo' ? undefined : user?.id,
  });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });

  const [date, setDate] = useState(today());
  const [blocks, setBlocks] = useState<DailyBlock[]>([createEmptyBlock()]);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: holidaysForDate } = useHolidays({ dateFrom: date, dateTo: date });
  /** Catálogo completo (unas decenas de filas) para marcarlos en el calendario, navegue al mes que navegue. */
  const { data: allHolidays } = useHolidays({});
  const { data: entriesForDate } = useHourEntriesList(user ? { userId: user.id, dateFrom: date, dateTo: date, pageSize: 100 } : {});
  const existingHoursForDate = (entriesForDate?.items ?? [])
    .filter((e) => e.status !== 'rejected')
    .reduce((sum, e) => sum + e.hours, 0);
  /** Solo lo NO marcado como horas extra cuenta contra el tope diario — el resto puede superarlo libremente. */
  const existingNonOvertimeHoursForDate = (entriesForDate?.items ?? [])
    .filter((e) => e.status !== 'rejected' && !e.isOvertime)
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
    return project ? getProjectOptionLabel(project) : `Registro ${index + 1}`;
  };
  const adjustHours = (key: string, delta: number) => {
    setBlocks((prev) => prev.map((block) => (block.key === key ? { ...block, hours: stepBlockHours(block.hours, delta) } : block)));
  };

  const dailyTotal = blocks.reduce((sum, block) => sum + (Number(block.hours) || 0), 0);
  const totalWithExisting = existingHoursForDate + dailyTotal;
  const nonOvertimeBlockTotal = blocks.reduce((sum, block) => sum + (block.isOvertime ? 0 : Number(block.hours) || 0), 0);
  const nonOvertimeTotalWithExisting = existingNonOvertimeHoursForDate + nonOvertimeBlockTotal;
  const exceedsDailyCap = nonOvertimeTotalWithExisting > DAILY_CAP_HOURS;

  useEffect(() => {
    onTotalChange?.(totalWithExisting);
  }, [totalWithExisting, onTotalChange]);

  const validateBlock = (block: DailyBlock) =>
    validateDailyBlock(block, { projects: projects?.items ?? [], isCollaborator: user?.role === 'collaborator' });

  const canSubmit = !blockingMessage && !exceedsDailyCap && blocks.every((block) => validateBlock(block) === null);

  const onSubmit = async () => {
    setServerError(null);
    if (blockingMessage || exceedsDailyCap) return;
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
          moduleId: needsProject && block.moduleId ? block.moduleId : undefined,
          category: block.category.trim(),
          description: block.description || undefined,
          hours: Number(block.hours),
          date,
          isOvertime: block.isOvertime,
          designatedApproverUserId: block.designatedApproverUserId || undefined,
          hasBlocker: block.hasBlocker,
          blockerDescription: block.hasBlocker ? block.blockerDescription : undefined,
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

      <TextField
        label="Fecha de registro"
        type="date"
        required
        holidays={allHolidays}
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />

      {!blockingMessage && !exceedsDailyCap && existingNonOvertimeHoursForDate > 0 && existingNonOvertimeHoursForDate < DAILY_CAP_HOURS && (
        <div className={styles.noticeInfo} role="status">
          <AlertIcon size={16} />
          <span>
            Ya tienes {existingNonOvertimeHoursForDate.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h registradas este
            día. Al superar {DAILY_CAP_HOURS}h, marca horas extra.
          </span>
        </div>
      )}

      {!blockingMessage && exceedsDailyCap && (
        <div className={styles.noticeWarning} role="alert">
          <AlertIcon size={16} />
          <span>
            Superarías el límite diario de {DAILY_CAP_HOURS}h ({totalWithExisting.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h
            en total ese día). Marca las horas que correspondan como "Horas Extra" para poder guardar.
          </span>
        </div>
      )}

      {blockingMessage && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{blockingMessage}</span>
        </div>
      )}

      {blocks.map((block, index) => (
        <DailyEntryBlockFields
          key={block.key}
          block={block}
          index={index}
          removable={blocks.length > 1}
          projects={projects?.items ?? []}
          leaders={leaders?.items ?? []}
          isCollaborator={user?.role === 'collaborator'}
          error={blockErrors[block.key]}
          title={blockTitle(block, index)}
          onUpdate={(patch) => updateBlock(block.key, patch)}
          onRemove={() => removeBlock(block.key)}
          onToggleExpand={() => toggleExpand(block.key)}
          onAdjustHours={(delta) => adjustHours(block.key, delta)}
        />
      ))}

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
        <Button type="button" disabled={!canSubmit} loading={submitting} loadingText="Guardando…" onClick={() => void onSubmit()}>
          Guardar y enviar para aprobación
        </Button>
      </div>
    </div>
  );
}

/**
 * Aislado del formulario principal porque necesita `useProjectDetail` (para
 * el selector de Módulo) por bloque — llamarlo dentro de `blocks.map(...)`
 * directamente rompería las reglas de hooks. También lo reutiliza la edición
 * de un registro (`HourEntryFormDialog`) para verse igual que el alta.
 */
export function DailyEntryBlockFields({
  block,
  index,
  removable,
  projects,
  leaders,
  isCollaborator,
  error,
  title,
  onUpdate,
  onRemove,
  onToggleExpand,
  onAdjustHours,
}: {
  block: DailyBlock;
  index: number;
  removable: boolean;
  projects: ProjectSummary[];
  leaders: { id: string; fullName: string }[];
  isCollaborator: boolean;
  error?: string;
  title: string;
  onUpdate: (patch: Partial<DailyBlock>) => void;
  onRemove: () => void;
  onToggleExpand: () => void;
  onAdjustHours: (delta: number) => void;
}) {
  const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment as HourEntryAssignment);
  const showApproverInRow = block.assignment !== '' && !needsProject && (isCollaborator || block.isOvertime);
  const selectedProject = needsProject ? projects.find((p) => p.id === block.projectId) : undefined;
  const overtimeDisabled = needsProject && !selectedProject?.allowsOvertime;
  const { data: projectDetail } = useProjectDetail(needsProject && block.projectId ? block.projectId : null);
  const selectedModule = projectDetail?.modules.find((m) => m.id === block.moduleId);

  return (
    <div className={styles.block}>
      <div
        className={[styles.blockHeader, block.expanded ? styles.blockHeaderExpanded : ''].join(' ')}
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {block.expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        <span className={styles.blockTitle}>{title}</span>
        {removable && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
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
                onUpdate({
                  assignment: event.target.value as HourEntryAssignment,
                  projectId: needsProjectNext ? block.projectId : '',
                  moduleId: needsProjectNext ? block.moduleId : '',
                  designatedApproverUserId: needsProjectNext ? '' : block.designatedApproverUserId,
                });
              }}
            />
            {showApproverInRow ? (
              <Select
                label="Líder aprobador"
                required
                placeholder="Selecciona a quién aprueba estas horas"
                options={leaders.map((leader) => ({ value: leader.id, label: leader.fullName }))}
                value={block.designatedApproverUserId}
                onChange={(event) => onUpdate({ designatedApproverUserId: event.target.value })}
              />
            ) : (
              <Combobox
                label="Proyecto"
                disabled={!needsProject}
                placeholder="Buscar proyecto..."
                options={projects.map((project) => ({ value: project.id, label: getProjectOptionLabel(project) }))}
                value={block.projectId}
                onChange={(nextProjectId) => {
                  const nextProject = projects.find((p) => p.id === nextProjectId);
                  onUpdate({
                    projectId: nextProjectId,
                    moduleId: '',
                    isOvertime: nextProject?.allowsOvertime ? block.isOvertime : false,
                  });
                }}
              />
            )}
          </div>

          {needsProject && block.projectId && (projectDetail?.modules.length ?? 0) > 0 && (
            <div className={styles.row}>
              <Select
                label="Módulo"
                placeholder="Seleccionar módulo (opcional)"
                options={(projectDetail?.modules ?? []).map((module) => ({ value: module.id, label: module.name }))}
                value={block.moduleId}
                onChange={(event) => onUpdate({ moduleId: event.target.value })}
              />
              {selectedModule && (
                <span className={styles.stepperLabel}>Etapa: {PROJECT_MODULE_STAGE_LABELS[selectedModule.currentStage]}</span>
              )}
            </div>
          )}

          <TextField
            label="Actividad"
            required
            placeholder="Ej: Diseño de wireframes de alta fidelidad para módulo dashboard"
            value={block.category}
            onChange={(event) => onUpdate({ category: event.target.value })}
          />

          <div className={styles.row}>
            <div className={styles.stepperField}>
              <span className={styles.stepperLabel}>Horas Trabajadas</span>
              <div className={styles.stepper}>
                <button type="button" className={styles.stepperButton} onClick={() => onAdjustHours(-HOURS_STEP)}>
                  −
                </button>
                <input
                  className={styles.stepperInput}
                  type="number"
                  step={HOURS_STEP}
                  min={0}
                  value={block.hours}
                  onChange={(event) => onUpdate({ hours: event.target.value })}
                />
                <button type="button" className={styles.stepperButton} onClick={() => onAdjustHours(HOURS_STEP)}>
                  +
                </button>
              </div>
            </div>

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
                  checked={block.isOvertime}
                  onChange={(event) => onUpdate({ isOvertime: event.target.checked })}
                />
                <span className={styles.overtimeSwitch} aria-hidden="true" />
                <span className={styles.overtimeState}>{block.isOvertime ? 'Marcada' : 'No marcada'}</span>
              </label>
              {block.isOvertime ? (
                <span className={styles.overtimeHelp}>
                  {needsProject
                    ? 'Quedará pendiente de aprobación del líder del proyecto.'
                    : 'Quedará pendiente de aprobación del líder que selecciones.'}
                </span>
              ) : (
                needsProject &&
                block.projectId &&
                overtimeDisabled && <span className={styles.overtimeHelp}>Este proyecto no tiene autorizadas horas extra.</span>
              )}
            </div>
          </div>

          <div className={styles.textareaField}>
            <label className={styles.textareaLabel}>Descripción / Bitácora Detallada</label>
            <textarea
              className={styles.textarea}
              placeholder="Describa detalladamente el avance técnico realizado (mínimo 5 caracteres)"
              value={block.description}
              onChange={(event) => onUpdate({ description: event.target.value })}
            />
          </div>

          <div className={styles.overtimeField}>
            <span className={styles.stepperLabel}>¿Hubo algún bloqueo o problema?</span>
            <label className={styles.overtimeToggleRow}>
              <input
                type="checkbox"
                className={styles.overtimeCheckbox}
                checked={block.hasBlocker}
                onChange={(event) => onUpdate({ hasBlocker: event.target.checked })}
              />
              <span className={styles.overtimeSwitch} aria-hidden="true" />
              <span className={styles.overtimeState}>{block.hasBlocker ? 'Sí' : 'No'}</span>
            </label>
          </div>

          {block.hasBlocker && (
            <div className={styles.textareaField}>
              <label className={styles.textareaLabel}>Describe el bloqueo</label>
              <textarea
                className={styles.textarea}
                placeholder="¿Qué te está bloqueando o generando un problema?"
                value={block.blockerDescription}
                onChange={(event) => onUpdate({ blockerDescription: event.target.value })}
              />
            </div>
          )}

          {error && (
            <span className={styles.blockError} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
