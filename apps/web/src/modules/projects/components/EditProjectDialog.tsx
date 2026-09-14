import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_SALES_STAGES,
  PROJECT_SALES_STAGE_LABELS,
  updateProjectSchema,
  type ProjectDetail,
  type ProjectPriority,
  type UpdateProjectInput,
} from '@kora/contracts';
import styles from './EditProjectDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useUpdateProject } from '../api/projects.queries';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

type ProjectFormValues = z.input<typeof updateProjectSchema>;

const SALES_STAGE_OPTIONS = PROJECT_SALES_STAGES.map((stage) => ({ value: stage, label: PROJECT_SALES_STAGE_LABELS[stage] }));
const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
const PRIORITY_ORDER: readonly ProjectPriority[] = ['high', 'medium', 'low'];
const PRIORITY_OPTIONS = PRIORITY_ORDER.map((priority) => ({ value: priority, label: PROJECT_PRIORITY_LABELS[priority] }));

/** `''` de un `<select>`/fecha sin elegir → `null`, para que el backend lo interprete como "limpiar el campo" y no como "no tocar" (`undefined`). */
const emptyToNull = (value: string) => value || null;

export interface EditProjectDialogProps {
  open: boolean;
  project: ProjectDetail;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * Edición de los datos generales de un proyecto ya creado. El tipo
 * (desarrollo/soporte) no se edita aquí: es inmutable tras la creación. Los
 * equipos asignados sí permiten editar líder/colaboradores/horas (como en la
 * v1) — agregar o quitar equipos sigue siendo un flujo aparte en la ficha
 * (`DevelopmentProjectDetailView`).
 */
export function EditProjectDialog({ open, project, onClose, onSuccess }: EditProjectDialogProps) {
  const isDevelopment = project.type === 'development';
  const updateProject = useUpdateProject();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues, unknown, UpdateProjectInput>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: toFormValues(project),
  });

  const { fields: teamFields } = useFieldArray({ control, name: 'teams' });

  useEffect(() => {
    if (!open) return;
    reset(toFormValues(project));
    setServerError(null);
  }, [open, project, reset]);

  const clientId = watch('clientId') ?? '';

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });
  const { data: developers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'collaborator' });
  const { data: commercialUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'commercial' });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await updateProject.mutateAsync({ projectId: project.id, input: values });
      onSuccess(`Se actualizaron los datos de ${values.name ?? project.name}.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const issues = error.fieldIssues;
        if (issues) {
          for (const [field, messages] of Object.entries(issues)) {
            if (field in values && messages[0]) {
              setError(field as keyof ProjectFormValues, { message: messages[0] });
            }
          }
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      }
    }
  });

  return (
    <Modal
      open={open}
      wide
      title="Editar proyecto"
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-project-form" loading={isSubmitting} loadingText="Guardando…">
            Guardar cambios
          </Button>
        </>
      }
    >
      <form id="edit-project-form" className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.alert} role="alert">
            <AlertIcon size={18} className={styles.alertIcon} />
            <span>{serverError}</span>
          </div>
        )}

        <div className={styles.section}>
          <TextField label="Nombre del proyecto" required errorText={errors.name?.message} {...register('name')} />

          <Combobox
            label="Cliente"
            placeholder="Buscar cliente…"
            options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
            value={clientId}
            onChange={(value) => setValue('clientId', value || null, { shouldValidate: true })}
            emptyMessage="No se encontraron clientes."
          />

          <div className={styles.row3}>
            <Select
              label="Líder Kabeli a cargo"
              placeholder="Sin asignar"
              options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              {...register('leaderUserId', { setValueAs: emptyToNull })}
            />
            <Select
              label="Desarrollador"
              placeholder="Sin asignar"
              options={(developers?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              {...register('developerUserId', { setValueAs: emptyToNull })}
            />
            <Select
              label="Responsable comercial"
              placeholder="Sin asignar"
              options={(commercialUsers?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              {...register('commercialManagerUserId', { setValueAs: emptyToNull })}
            />
          </div>

          <div className={styles.row3}>
            {isDevelopment && (
              <Select
                label="Etapa comercial"
                placeholder="Sin definir"
                options={SALES_STAGE_OPTIONS}
                {...register('salesStage', { setValueAs: emptyToNull })}
              />
            )}
            {isDevelopment && (
              <Select
                label="Etapa de avance"
                placeholder="Sin definir"
                options={PHASE_OPTIONS}
                {...register('phase', { setValueAs: emptyToNull })}
              />
            )}
            <Select
              label="Prioridad"
              placeholder="Sin definir"
              options={PRIORITY_OPTIONS}
              {...register('priority', { setValueAs: emptyToNull })}
            />
          </div>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Fechas y horas</h3>
          <div className={styles.row3}>
            <TextField label="Fecha de inicio" type="date" {...register('startDate', { setValueAs: emptyToNull })} />
            <TextField label="Fecha de fin" type="date" {...register('endDate', { setValueAs: emptyToNull })} />
            {isDevelopment && (
              <TextField
                label="Fecha estimada de entrega"
                type="date"
                {...register('estimatedDeliveryDate', { setValueAs: emptyToNull })}
              />
            )}
          </div>

          <div className={styles.row3}>
            <TextField label="HH vendidas" type="number" min={0} errorText={errors.soldHours?.message} {...register('soldHours')} />
            {isDevelopment && (
              <>
                <TextField
                  label="Avance real (%)"
                  type="number"
                  min={0}
                  max={100}
                  {...register('actualProgress', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
                />
                <TextField
                  label="Avance esperado (%)"
                  type="number"
                  min={0}
                  max={100}
                  {...register('expectedProgress', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
                />
              </>
            )}
            {!isDevelopment && (
              <TextField label="Horas de soporte" type="number" min={0} {...register('supportHours')} />
            )}
          </div>

          {!isDevelopment && (
            <TextField
              label="Plan de soporte"
              placeholder="Ej: Mensual, Bolsa de horas…"
              {...register('supportPlanDescription')}
            />
          )}
        </div>

        {isDevelopment && teamFields.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Equipos e involucrados</h3>
            <div className={styles.teamsSelected}>
              {teamFields.map((field, index) => (
                <div key={field.id} className={styles.teamDetailCard}>
                  <span className={styles.teamDetailName}>{project.teams[index]?.teamName ?? '—'}</span>
                  <div className={styles.row3}>
                    <Select
                      label="Líder"
                      placeholder="Sin asignar"
                      options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                      {...register(`teams.${index}.leaderUserId`, { setValueAs: emptyToNull })}
                    />
                    <TextField label="N° colaboradores" type="number" min={0} {...register(`teams.${index}.memberCount`)} />
                    <TextField label="Horas estimadas" type="number" min={0} {...register(`teams.${index}.assignedHours`)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Documentación</h3>
          <div className={styles.row}>
            <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
            <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

function toFormValues(project: ProjectDetail): ProjectFormValues {
  return {
    name: project.name,
    clientId: project.client?.id ?? null,
    salesStage: project.salesStage,
    phase: project.phase,
    priority: project.priority,
    leaderUserId: project.leader?.id ?? null,
    developerUserId: project.developer?.id ?? null,
    commercialManagerUserId: project.commercialManager?.id ?? null,
    startDate: project.startDate,
    endDate: project.endDate,
    estimatedDeliveryDate: project.estimatedDeliveryDate,
    soldHours: project.soldHours,
    expectedProgress: project.expectedProgress,
    actualProgress: project.actualProgress,
    supportPlanDescription: project.supportPlanDescription ?? '',
    supportHours: project.supportHours,
    quotationLink: project.quotationLink ?? '',
    contractLink: project.contractLink ?? '',
    teams: project.teams.map((team) => ({
      teamId: team.teamId,
      leaderUserId: team.leader?.id ?? undefined,
      memberCount: team.memberCount ?? undefined,
      assignedHours: team.assignedHours ?? undefined,
    })),
  };
}
