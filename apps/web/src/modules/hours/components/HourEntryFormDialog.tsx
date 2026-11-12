import { useEffect, useMemo, useState } from 'react';
import {
  HOUR_ENTRY_ASSIGNMENTS,
  isLegacyHourEntryProject,
  PROJECT_REQUIRING_ASSIGNMENTS,
  hourEntryRequiresApproval,
  type HourEntryAssignment,
  type HourEntrySummary,
  type ProjectSummary,
} from '@kora/contracts';
import styles from './HourEntryFormDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Tabs } from '@/shared/components/ui/Tabs';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useHolidays, useHourEntriesList, useHourEntryDetail, useUpdateHourEntry } from '../api/hours.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { getProjectOptionLabel } from '@/modules/projects/lib/project-option-label';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { HOUR_ENTRY_PROJECT_STATUSES, filterHourEntryProjects } from '../lib/selectable-project-statuses';
import { ApiRequestError } from '@/shared/lib/api-client';
import {
  DAILY_CAP_HOURS,
  DailyEntryBlockFields,
  DailyEntryForm,
  isWeekend,
  overflowByBlock,
  stepBlockHours,
  validateDailyBlock,
  type DailyBlock,
  type TaskHourEntryTarget,
} from './DailyEntryForm';
import { WeeklyEntryForm } from './WeeklyEntryForm';
import { canEditAnyMonth, isInCurrentMonth, OUTSIDE_CURRENT_MONTH_MESSAGE } from '../lib/edit-window';
import { OTHER_TASK_OPTION, toHourTaskId } from './hour-task-selection';

const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const NEW_ENTRY_TABS = [
  { id: 'diario', label: 'Registro diario' },
  { id: 'semanal', label: 'Registro semanal' },
] as const;

export interface HourEntryFormDialogProps {
  open: boolean;
  /** Registro a editar; `null` para un alta nueva. */
  entry: HourEntrySummary | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Solo lectura — para revisar el registro de otro colaborador sin poder editarlo. */
  readOnly?: boolean;
  /** Alta vinculada a una tarea, con finalización posterior al guardado exitoso. */
  initialTask?: TaskHourEntryTarget;
}

/**
 * Alta/edición de registros de horas — equivalente a `RegistroHHModal.tsx`
 * de la v1. Editar un registro existente sigue siendo un formulario simple de
 * una sola entrada (no tiene sentido "agregar más proyectos" al editar una
 * fila ya guardada). Para un alta nueva, replica las dos pestañas de la v1:
 * "Registro diario" (varios proyectos el mismo día) y "Registro semanal"
 * (un proyecto, lunes a viernes) — ver `DailyEntryForm`/`WeeklyEntryForm`.
 */
export function HourEntryFormDialog({ open, entry, onClose, onSuccess, readOnly = false, initialTask }: HourEntryFormDialogProps) {
  const [tab, setTab] = useState<'diario' | 'semanal'>('diario');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (open) setTab('diario');
  }, [open, entry]);

  if (entry && readOnly) {
    return (
      <Modal open={open} onClose={onClose} title="Detalle del registro" bodyScrollOnly>
        <ViewEntryDetail entry={entry} onClose={onClose} />
      </Modal>
    );
  }

  if (entry) {
    return (
      <Modal open={open} onClose={onClose} title="Editar registro de horas" wide bodyScrollOnly>
        <EditEntryForm key={entry.id} entry={entry} onClose={onClose} onSuccess={onSuccess} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar horas"
      wide
      bodyScrollOnly
      headerExtra={
        <span className={styles.headerTotal}>Total: {total.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h</span>
      }
    >
      {!initialTask && <div className={styles.tabsRow}>
        <Tabs tabs={NEW_ENTRY_TABS} activeId={tab} onSelect={(id) => setTab(id as 'diario' | 'semanal')} />
      </div>}
      {initialTask || tab === 'diario' ? (
        <DailyEntryForm key={initialTask ? 'task-' + initialTask.taskId : 'standard'}
          initialTask={initialTask} onClose={onClose} onSuccess={onSuccess} onTotalChange={setTotal} />
      ) : (
        <WeeklyEntryForm onClose={onClose} onSuccess={onSuccess} onTotalChange={setTotal} />
      )}
    </Modal>
  );
}

const blockFromEntry = (entry: HourEntrySummary): DailyBlock => ({
  key: entry.id,
  expanded: true,
  // Asignaciones históricas de la v1 (fuera del conjunto vigente) obligan a elegir una válida al editar.
  assignment: HOUR_ENTRY_ASSIGNMENTS.includes(entry.assignment as HourEntryAssignment)
    ? (entry.assignment as HourEntryAssignment)
    : '',
  projectId: entry.project?.id ?? '',
  moduleId: entry.module?.id ?? '',
  segmentId: entry.segment?.id ?? '',
  taskId: entry.taskId ?? OTHER_TASK_OPTION,
  category: entry.category,
  hours: String(entry.hours),
  description: entry.description,
  isOvertime: entry.isOvertime,
  designatedApproverUserId: entry.designatedApprover?.id ?? '',
  hasBlocker: entry.hasBlocker,
  blockerDescription: entry.blockerDescription ?? '',
});

/**
 * Edición de un registro existente — mismo bloque que el "Registro diario"
 * (`DailyEntryBlockFields`: stepper de horas, switch de horas extra, fase/tiempo de ejecución,
 * bitácora y bloqueo) con las mismas validaciones, pero de una sola entrada.
 */
function EditEntryForm({
  entry,
  onClose,
  onSuccess,
}: {
  entry: HourEntrySummary;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { user } = useAuth();
  const updateEntry = useUpdateHourEntry();
  const [date, setDate] = useState(entry.date);
  const [block, setBlock] = useState<DailyBlock>(() => blockFromEntry(entry));
  const [blockError, setBlockError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Igual que el alta: el dueño (salvo PMO) solo ve sus proyectos asignados;
  // admin/PMO editando el registro de otro ven todos.
  const restrictToAssigned = user?.id === entry.user.id && user?.role !== 'pmo';
  const { data: projectsData } = useProjectsList({
    page: 1,
    pageSize: 200,
    sortField: 'name',
    assignedToUserId: restrictToAssigned ? user?.id : undefined,
    status: HOUR_ENTRY_PROJECT_STATUSES,
  });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });
  /** Catálogo completo (unas decenas de filas): el calendario puede navegar a cualquier mes. */
  const { data: allHolidays } = useHolidays({});
  const { data: holidaysForDate } = useHolidays({ dateFrom: date, dateTo: date });
  const { data: entriesForDate } = useHourEntriesList({ userId: entry.user.id, dateFrom: date, dateTo: date, pageSize: 100 });

  // El proyecto guardado puede no venir en la lista (p. ej. ya no está asignado
  // al autor, o ya se finalizó): se agrega para que el combobox lo siga mostrando.
  const projects = useMemo(() => {
    const items = projectsData?.items ?? [];
    if (!entry.project || items.some((p) => p.id === entry.project?.id)) return items;
    return [{ id: entry.project.id, name: entry.project.name, client: null, allowsOvertime: false } as unknown as ProjectSummary, ...items];
  }, [projectsData, entry.project]);

  const holiday = holidaysForDate?.[0] ?? null;
  const blockingMessage = !canEditAnyMonth(user?.role) && !isInCurrentMonth(date)
    ? OUTSIDE_CURRENT_MONTH_MESSAGE
    : isWeekend(date)
      ? 'No se puede registrar horas en fines de semana.'
      : holiday
        ? `No se puede registrar horas el ${holiday.name} (feriado).`
        : null;
  /** El propio registro no cuenta contra el tope: se reemplaza por lo que quede en el bloque. */
  const otherNonOvertimeHours = (entriesForDate?.items ?? [])
    .filter((e) => e.id !== entry.id && e.status !== 'rejected' && !e.isOvertime)
    .reduce((sum, e) => sum + e.hours, 0);
  const nonOvertimeTotal = otherNonOvertimeHours + (block.isOvertime ? 0 : Number(block.hours) || 0);
  const editableProject = projects.find((project) => project.id === block.projectId);
  const legacyProject = editableProject ? isLegacyHourEntryProject(editableProject) : false;
  const filteredProjects = filterHourEntryProjects(projects, block.assignment);
  const selectableProjects = editableProject && entry.project?.id === block.projectId &&
    !filteredProjects.some((p) => p.id === block.projectId)
      ? [editableProject, ...filteredProjects] : filteredProjects;
  const maxHours = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment) &&
    editableProject && !editableProject.allowsOvertime && !block.isOvertime
    ? Math.max(0, Math.round((DAILY_CAP_HOURS - otherNonOvertimeHours) * 100) / 100)
    : undefined;
  const updateBlock = (patch: Partial<DailyBlock>) => {
    setBlock((prev) => {
      const next = { ...prev, ...patch };
      const project = projects.find((item) => item.id === next.projectId);
      if (PROJECT_REQUIRING_ASSIGNMENTS.has(next.assignment) &&
          project && !project.allowsOvertime && !next.isOvertime) {
        const max = Math.max(0, Math.round((DAILY_CAP_HOURS - otherNonOvertimeHours) * 100) / 100);
        if (Number(next.hours) > max) next.hours = max > 0 ? String(max) : '';
      }
      return next;
    });
  };
  /** Lo que el backend dejará como horas extra al guardar (ver `splitByDailyCap`). */
  const autoOvertimeHours = overflowByBlock(otherNonOvertimeHours, [block.isOvertime ? 0 : Number(block.hours) || 0])[0] ?? 0;

  // El aprobador obligatorio depende del rol del DUEÑO, no de quien edita. Al
  // editar el registro de otro (líder/PMO desde aprobaciones) no conocemos su
  // rol: si ya tenía aprobador designado, se sigue exigiendo.
  const ownerRequiresApprover =
    user?.id === entry.user.id ? user.role === 'collaborator' : entry.designatedApprover !== null;
  // Las horas extra de un líder se autoaprueban; con el registro de otro se asume que no.
  const overtimeNeedsApproval = user?.id === entry.user.id ? hourEntryRequiresApproval(user.role, true) : true;
  const validationOptions = {
    projects: selectableProjects,
    isCollaborator: ownerRequiresApprover,
    overtimeNeedsApproval,
    overtimeAlreadyGranted: entry.isOvertime && block.projectId === entry.project?.id,
    exceedsDailyCap: autoOvertimeHours > 0,
  };
  const canSubmit = !blockingMessage && validateDailyBlock(block, validationOptions) === null;
  const blockTitle = (() => {
    const project = projects.find((p) => p.id === block.projectId);
    return project ? getProjectOptionLabel(project) : block.assignment || 'Registro';
  })();

  const onSubmit = async () => {
    setServerError(null);
    if (blockingMessage) return;
    const error = validateDailyBlock(block, validationOptions);
    setBlockError(error);
    if (error) return;

    const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment);
    setSubmitting(true);
    try {
      await updateEntry.mutateAsync({
        entryId: entry.id,
        input: {
          assignment: block.assignment as HourEntryAssignment,
          projectId: needsProject ? block.projectId : null,
          moduleId: needsProject && (!legacyProject || entry.project?.id === block.projectId) && block.moduleId ? block.moduleId : null,
          segmentId: needsProject && (!legacyProject || entry.project?.id === block.projectId) && block.moduleId && block.segmentId ? block.segmentId : null,
          taskId: needsProject && (!legacyProject || entry.project?.id === block.projectId) && block.moduleId ? (toHourTaskId(block.taskId) ?? null) : null,
          category: block.category.trim(),
          description: block.description,
          hours: Number(block.hours),
          date,
          isOvertime: block.isOvertime,
          designatedApproverUserId: !needsProject && block.designatedApproverUserId ? block.designatedApproverUserId : null,
          hasBlocker: block.hasBlocker,
          blockerDescription: block.hasBlocker ? block.blockerDescription : undefined,
        },
      });
      onSuccess('Se actualizó el registro de horas.');
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo guardar el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
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

      {!blockingMessage && autoOvertimeHours > 0 && (!PROJECT_REQUIRING_ASSIGNMENTS.has(block.assignment) || editableProject?.allowsOvertime) && (
        <div className={styles.noticeWarning} role="status">
          <AlertIcon size={16} />
          <span>
            Superas la jornada de {DAILY_CAP_HOURS}h ({nonOvertimeTotal.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h
            normales ese día): {autoOvertimeHours.toLocaleString('es-CL', { maximumFractionDigits: 2 })}h quedarán como horas
            extra{overtimeNeedsApproval ? ', pendientes de aprobación.' : '.'}
          </span>
        </div>
      )}

      {blockingMessage && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{blockingMessage}</span>
        </div>
      )}

      <DailyEntryBlockFields
        block={block}
        index={0}
        removable={false}
        projects={projects}
        historicalProjectId={entry.project?.id}
        historicalAssignment={entry.assignment as HourEntryAssignment}
        leaders={leaders?.items ?? []}
        isCollaborator={ownerRequiresApprover}
        overtimeNeedsApproval={overtimeNeedsApproval}
        exceedsDailyCap={autoOvertimeHours > 0}
        maxHours={maxHours}
        error={blockError ?? undefined}
        title={blockTitle}
        onUpdate={updateBlock}
        onRemove={() => undefined}
        onToggleExpand={() => setBlock((prev) => ({ ...prev, expanded: !prev.expanded }))}
        onAdjustHours={(delta) => updateBlock({ hours: stepBlockHours(block.hours, delta) })}
        ownerUserId={entry.user.id}
      />

      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" disabled={!canSubmit} loading={submitting} loadingText="Guardando…" onClick={() => void onSubmit()}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

/**
 * "Ver" — mismo lenguaje visual que `DailyEntryForm` (bloque con cabecera,
 * stepper de horas, switch de horas extra, bitácora), pero de solo lectura:
 * un único bloque prellenado con el registro guardado, sin acciones de guardar.
 */
function ViewEntryDetail({ entry, onClose }: { entry: HourEntrySummary; onClose: () => void }) {
  const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(entry.assignment as (typeof HOUR_ENTRY_ASSIGNMENTS)[number]);
  const blockTitle = entry.project?.name || entry.assignment || 'Registro';
  // `HourEntrySummary` no trae quién/cuándo decidió — antes ese dato quedaba
  // enterrado en el backend porque nada llamaba al detalle.
  const { data: detail } = useHourEntryDetail(entry.status !== 'pending' ? entry.id : null);

  return (
    <div className={styles.form}>
      <div className={styles.block}>
        <div className={[styles.blockHeader, styles.blockHeaderExpanded].join(' ')}>
          <span className={styles.blockTitle}>{blockTitle}</span>
        </div>

        <div className={styles.blockBody}>
          <div className={styles.row}>
            <TextField label="Asignación" disabled readOnly value={entry.assignment ?? 'Desarrollo'} />
            {needsProject ? (
              <TextField label="Proyecto" disabled readOnly value={entry.project?.name ?? ''} />
            ) : (
              <TextField label="Aprobador designado" disabled readOnly value={entry.designatedApprover?.fullName ?? '—'} />
            )}
          </div>

          {needsProject && (
            <div className={styles.row}>
              <TextField label="Fase" disabled readOnly value={entry.module?.name ?? '—'} />
              <TextField label="Tiempo de ejecución" disabled readOnly value={entry.segment?.name ?? '—'} />
            </div>
          )}

          <TextField label="Actividad" disabled readOnly value={entry.category} />

          <div className={styles.row}>
            <div className={styles.stepperField}>
              <span className={styles.stepperLabel}>Horas Trabajadas</span>
              <div className={styles.stepper}>
                <button type="button" className={styles.stepperButton} disabled>
                  −
                </button>
                <input className={styles.stepperInput} value={entry.hours} disabled readOnly />
                <button type="button" className={styles.stepperButton} disabled>
                  +
                </button>
              </div>
            </div>

            <div className={styles.overtimeField}>
              <span className={styles.stepperLabel}>Horas Extra</span>
              <div className={styles.overtimeToggleRow}>
                <span className={styles.overtimeSwitch} aria-hidden="true" />
                <span className={styles.overtimeState}>{entry.isOvertime ? 'Sí' : 'No'}</span>
              </div>
            </div>
          </div>

          <div className={styles.textareaField}>
            <label className={styles.textareaLabel}>Descripción / Bitácora Detallada</label>
            <textarea className={styles.textarea} value={entry.description} disabled readOnly />
          </div>

          {entry.status === 'rejected' && entry.rejectionReason && (
            <div className={styles.alert} role="alert">
              <AlertIcon size={18} className={styles.alertIcon} />
              <span>Motivo de rechazo: {entry.rejectionReason}</span>
            </div>
          )}

          {detail && (detail.decisionBy || detail.decisionAt) && (
            <p className={styles.decisionInfo}>
              {entry.status === 'approved' ? 'Aprobado' : 'Rechazado'} por {detail.decisionBy?.fullName ?? 'Sistema'}
              {detail.decisionAt ? ` el ${formatDateTime(detail.decisionAt)}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
