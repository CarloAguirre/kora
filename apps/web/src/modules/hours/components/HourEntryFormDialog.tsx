import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createHourEntrySchema,
  HOUR_ENTRY_ASSIGNMENTS,
  PROJECT_REQUIRING_ASSIGNMENTS,
  type CreateHourEntryInput,
  type HourEntrySummary,
} from '@kora/contracts';
import styles from './HourEntryFormDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Tabs } from '@/shared/components/ui/Tabs';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useHourEntryDetail, useUpdateHourEntry } from '../api/hours.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { getProjectOptionLabel } from '@/modules/projects/lib/project-option-label';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';
import { DailyEntryForm } from './DailyEntryForm';
import { WeeklyEntryForm } from './WeeklyEntryForm';

/** Proyecto primero: es la asignación más común y el resto confundía al elegir. */
const ASSIGNMENT_OPTIONS = [...HOUR_ENTRY_ASSIGNMENTS]
  .sort((a, b) => (a === 'Proyecto' ? -1 : b === 'Proyecto' ? 1 : 0))
  .map((value) => ({ value, label: value }));
const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const NEW_ENTRY_TABS = [
  { id: 'diario', label: 'Registro diario' },
  { id: 'semanal', label: 'Registro semanal' },
] as const;
type FormValues = z.input<typeof createHourEntrySchema>;

export interface HourEntryFormDialogProps {
  open: boolean;
  /** Registro a editar; `null` para un alta nueva. */
  entry: HourEntrySummary | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Solo lectura — para revisar el registro de otro colaborador sin poder editarlo. */
  readOnly?: boolean;
}

/**
 * Alta/edición de registros de horas — equivalente a `RegistroHHModal.tsx`
 * de la v1. Editar un registro existente sigue siendo un formulario simple de
 * una sola entrada (no tiene sentido "agregar más proyectos" al editar una
 * fila ya guardada). Para un alta nueva, replica las dos pestañas de la v1:
 * "Registro diario" (varios proyectos el mismo día) y "Registro semanal"
 * (un proyecto, lunes a viernes) — ver `DailyEntryForm`/`WeeklyEntryForm`.
 */
export function HourEntryFormDialog({ open, entry, onClose, onSuccess, readOnly = false }: HourEntryFormDialogProps) {
  const [tab, setTab] = useState<'diario' | 'semanal'>('diario');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (open) setTab('diario');
  }, [open, entry]);

  if (entry && readOnly) {
    return (
      <Modal open={open} onClose={onClose} title="Detalle del registro">
        <ViewEntryDetail entry={entry} onClose={onClose} />
      </Modal>
    );
  }

  if (entry) {
    return (
      <Modal open={open} onClose={onClose} title="Editar registro de horas">
        <EditEntryForm entry={entry} onClose={onClose} onSuccess={onSuccess} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar horas"
      wide
      headerExtra={
        <span className={styles.headerTotal}>Total: {total.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h</span>
      }
    >
      <div className={styles.tabsRow}>
        <Tabs tabs={NEW_ENTRY_TABS} activeId={tab} onSelect={(id) => setTab(id as 'diario' | 'semanal')} />
      </div>
      {tab === 'diario' ? (
        <DailyEntryForm onClose={onClose} onSuccess={onSuccess} onTotalChange={setTotal} />
      ) : (
        <WeeklyEntryForm onClose={onClose} onSuccess={onSuccess} onTotalChange={setTotal} />
      )}
    </Modal>
  );
}

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
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: projects } = useProjectsList({ page: 1, pageSize: 200, sortField: 'name' });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, CreateHourEntryInput>({
    resolver: zodResolver(createHourEntrySchema),
    defaultValues: {
      assignment: (entry.assignment as CreateHourEntryInput['assignment']) ?? 'Proyecto',
      projectId: entry.project?.id ?? undefined,
      category: entry.category,
      description: entry.description,
      hours: entry.hours,
      date: entry.date,
      isOvertime: entry.isOvertime,
      designatedApproverUserId: entry.designatedApprover?.id ?? undefined,
    },
  });

  const assignment = watch('assignment');
  const needsProject = PROJECT_REQUIRING_ASSIGNMENTS.has(assignment);
  const needsApprover = !needsProject && user?.role === 'collaborator';

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await updateEntry.mutateAsync({ entryId: entry.id, input: values });
      onSuccess('Se actualizó el registro de horas.');
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo guardar el registro.');
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {serverError && (
        <div className={styles.alert} role="alert">
          <AlertIcon size={18} className={styles.alertIcon} />
          <span>{serverError}</span>
        </div>
      )}

      <div className={styles.row}>
        <Select label="Asignación" required options={ASSIGNMENT_OPTIONS} {...register('assignment')} />
        <TextField label="Fecha" type="date" required errorText={errors.date?.message} {...register('date')} />
      </div>

      {needsProject && (
        <Select
          label="Proyecto"
          required
          placeholder="Selecciona un proyecto"
          options={(projects?.items ?? []).map((project) => ({ value: project.id, label: getProjectOptionLabel(project) }))}
          errorText={errors.projectId?.message}
          {...register('projectId')}
        />
      )}

      {needsApprover && (
        <Select
          label="Líder aprobador"
          required
          placeholder="Selecciona a quién aprueba estas horas"
          options={(leaders?.items ?? []).map((leader) => ({ value: leader.id, label: leader.fullName }))}
          errorText={errors.designatedApproverUserId?.message}
          {...register('designatedApproverUserId')}
        />
      )}

      <div className={styles.row}>
        <TextField label="Categoría / Actividad" placeholder="p. ej. Desarrollo, Reunión..." {...register('category')} />
        <TextField label="Horas" type="number" step="0.25" required errorText={errors.hours?.message} {...register('hours')} />
      </div>

      <div className={styles.row}>
        <TextField label="Descripción" placeholder="Detalle de la actividad" {...register('description')} />
        <label className={styles.overtimeToggle}>
          <input type="checkbox" {...register('isOvertime')} />
          <span>Horas extra</span>
        </label>
      </div>

      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting} loadingText="Guardando…">
          Guardar cambios
        </Button>
      </div>
    </form>
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

