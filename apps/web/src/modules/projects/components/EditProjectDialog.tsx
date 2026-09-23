import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createProjectModuleSchema,
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  PROJECT_MODULE_STAGES,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  updateProjectSchema,
  type CreateProjectModuleInput,
  type ProjectDetail,
  type ProjectModule,
  type ProjectPriority,
  type ProjectSalesStage,
  type ProjectStatus,
  type UpdateProjectInput,
  type UpdateProjectModuleInput,
} from '@kora/contracts';
import styles from './EditProjectDialog.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { AlertIcon, PlusIcon, TrashIcon, CloseIcon } from '@/shared/components/icons/Icons';
import {
  useAddProjectModuleDelivery,
  useChangeProjectStatus,
  useCreateProjectModule,
  useDeleteProjectModule,
  useRemoveProjectModuleDelivery,
  useUpdateProject,
  useUpdateProjectModule,
} from '../api/projects.queries';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

type ProjectFormValues = z.input<typeof updateProjectSchema>;

const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
const PRIORITY_ORDER: readonly ProjectPriority[] = ['high', 'medium', 'low'];
const PRIORITY_OPTIONS = PRIORITY_ORDER.map((priority) => ({ value: priority, label: PROJECT_PRIORITY_LABELS[priority] }));
const MODULE_STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));

interface DeliveryDraft {
  teamId: string;
  estimatedDate: string;
}
const EMPTY_DELIVERY_DRAFT: DeliveryDraft = { teamId: '', estimatedDate: '' };

/** Edición en línea de los datos propios de una fase ya creada — mismos campos que "Agregar fase/módulo", salvo `initialStage` (inmutable tras la creación, ver `moduleEditHead`). */
interface ModuleEditDraft {
  name: string;
  estimatedHours: string;
  estimatedStartDate: string;
  estimatedEndDate: string;
}
const toModuleEditDraft = (module: ProjectModule): ModuleEditDraft => ({
  name: module.name,
  estimatedHours: module.estimatedHours != null ? String(module.estimatedHours) : '',
  estimatedStartDate: module.estimatedStartDate ?? '',
  estimatedEndDate: module.estimatedEndDate ?? '',
});

/** `''` de un `<select>`/fecha sin elegir → `null`, para que el backend lo interprete como "limpiar el campo" y no como "no tocar" (`undefined`). */
const emptyToNull = (value: string) => value || null;
/** `''` de un input opcional → `undefined`, para que `nullish()` no reciba una cadena vacía. */
const emptyToUndefined = (value: string) => value || undefined;

/**
 * "Tipo de proyecto" en cascada del mockup — capa de UI sobre `salesStage` +
 * `status` existentes (ver docs/DECISION-M3-ESTADOS.md: esos siguen siendo
 * campos independientes, esto solo los combina para mostrarlos/editarlos
 * juntos). Al guardar dispara `UpdateProjectUseCase` (salesStage) y, si el
 * Estado elegido cambió, también `ChangeProjectStatusUseCase`.
 */
type ProjectTipo = 'prospecto' | 'cotizacion' | 'aprobado' | 'finalizado';

function deriveTipo(salesStage: ProjectSalesStage | null, status: ProjectStatus): ProjectTipo {
  if (status === 'finished') return 'finalizado';
  if (salesStage === 'approved') return 'aprobado';
  if (salesStage === 'quoted') return 'cotizacion';
  return 'prospecto';
}

const TIPO_OPTIONS: Array<{ value: ProjectTipo; label: string }> = [
  { value: 'prospecto', label: 'Prospecto' },
  { value: 'cotizacion', label: 'En cotización' },
  { value: 'aprobado', label: 'Proyecto aprobado' },
  { value: 'finalizado', label: 'Proyecto finalizado' },
];

/** A qué `salesStage` mapea cada Tipo — `finalizado` no toca `salesStage` (deja el que ya tenía). */
const TIPO_TO_SALES_STAGE: Record<ProjectTipo, ProjectSalesStage | null> = {
  prospecto: 'prospect',
  cotizacion: 'quoted',
  aprobado: 'approved',
  finalizado: null,
};

const ESTADO_OPTIONS_BY_TIPO: Record<ProjectTipo, ProjectStatus[]> = {
  prospecto: ['draft', 'on_hold'],
  cotizacion: ['draft', 'on_hold'],
  aprobado: ['on_hold', 'active'],
  finalizado: ['finished'],
};

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
  const changeStatus = useChangeProjectStatus();
  const toast = useToast();
  const createModule = useCreateProjectModule();
  const updateModule = useUpdateProjectModule();
  const deleteModule = useDeleteProjectModule();
  const addDelivery = useAddProjectModuleDelivery();
  const removeDelivery = useRemoveProjectModuleDelivery();
  const [showNewModuleForm, setShowNewModuleForm] = useState(false);
  const [moduleDrafts, setModuleDrafts] = useState<Record<string, ModuleEditDraft>>({});
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, DeliveryDraft>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<ProjectTipo>(() => deriveTipo(project.salesStage, project.status));
  const [estado, setEstado] = useState<ProjectStatus>(project.status);

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

  const { fields: teamFields, append: appendTeam, remove: removeTeam } = useFieldArray({ control, name: 'teams' });

  useEffect(() => {
    if (!open) return;
    reset(toFormValues(project));
    setTipo(deriveTipo(project.salesStage, project.status));
    setEstado(project.status);
    setServerError(null);
  }, [open, project, reset]);

  const clientId = watch('clientId') ?? '';
  const teamsValue = watch('teams') ?? [];

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' }, { enabled: open });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' }, { enabled: open });
  const { data: developers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'collaborator' }, { enabled: open });
  const { data: commercialUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'commercial' }, { enabled: open });
  const { data: teamsCatalog } = useTeamsList({ page: 1, pageSize: 50, sortField: 'name' }, { enabled: open });

  const newModuleForm = useForm<z.input<typeof createProjectModuleSchema>, unknown, CreateProjectModuleInput>({
    resolver: zodResolver(createProjectModuleSchema),
    defaultValues: { name: '', initialStage: 'discovery' },
  });

  // Entregas estimadas del módulo nuevo: el módulo todavía no existe (no hay
  // `moduleId` para colgarlas), así que se juntan acá y recién se crean —
  // igual que en `NewProjectPage` — apenas responde `createModule`.
  const [newModuleDeliveries, setNewModuleDeliveries] = useState<{ localId: number; estimatedDate: string }[]>([]);
  const nextNewModuleDeliveryId = useRef(1);

  const addNewModuleDelivery = () => {
    setNewModuleDeliveries((prev) => [...prev, { localId: nextNewModuleDeliveryId.current++, estimatedDate: '' }]);
  };
  const removeNewModuleDelivery = (localId: number) => {
    setNewModuleDeliveries((prev) => prev.filter((delivery) => delivery.localId !== localId));
  };
  const updateNewModuleDeliveryDate = (localId: number, estimatedDate: string) => {
    setNewModuleDeliveries((prev) => prev.map((delivery) => (delivery.localId === localId ? { ...delivery, estimatedDate } : delivery)));
  };

  const onCreateModule = newModuleForm.handleSubmit(async (values) => {
    try {
      const module = await createModule.mutateAsync({ projectId: project.id, input: values });
      const pendingDeliveries = newModuleDeliveries.filter((delivery) => delivery.estimatedDate);
      if (pendingDeliveries.length > 0) {
        await Promise.all(
          pendingDeliveries.map((delivery) =>
            addDelivery.mutateAsync({
              projectId: project.id,
              moduleId: module.id,
              input: { estimatedDate: delivery.estimatedDate },
            }),
          ),
        );
      }
      toast.success('Se agregó el módulo.');
      newModuleForm.reset({ name: '', initialStage: 'discovery' });
      setNewModuleDeliveries([]);
      setShowNewModuleForm(false);
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo agregar el módulo.');
    }
  });

  const onDeleteModule = async (moduleId: string, name: string) => {
    try {
      await deleteModule.mutateAsync({ projectId: project.id, moduleId });
      toast.success(`Se eliminó "${name}".`);
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo eliminar el módulo.');
    }
  };

  const moduleDraft = (module: ProjectModule) => moduleDrafts[module.id] ?? toModuleEditDraft(module);
  const setModuleDraftField = (module: ProjectModule, patch: Partial<ModuleEditDraft>) =>
    setModuleDrafts((prev) => ({ ...prev, [module.id]: { ...moduleDraft(module), ...patch } }));

  const onSaveModuleField = async (moduleId: string, input: UpdateProjectModuleInput) => {
    try {
      await updateModule.mutateAsync({ projectId: project.id, moduleId, input });
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo actualizar la fase.');
    }
  };

  const onBlurModuleName = (module: ProjectModule) => {
    const name = moduleDraft(module).name.trim();
    if (name && name !== module.name) void onSaveModuleField(module.id, { name });
  };

  const onBlurModuleHours = (module: ProjectModule) => {
    const raw = moduleDraft(module).estimatedHours;
    const next = raw === '' ? null : Number(raw);
    if (next !== module.estimatedHours) void onSaveModuleField(module.id, { estimatedHours: next });
  };

  const onBlurModuleStartDate = (module: ProjectModule) => {
    const next = moduleDraft(module).estimatedStartDate || null;
    if (next !== module.estimatedStartDate) void onSaveModuleField(module.id, { estimatedStartDate: next });
  };

  const onBlurModuleEndDate = (module: ProjectModule) => {
    const next = moduleDraft(module).estimatedEndDate || null;
    if (next !== module.estimatedEndDate) void onSaveModuleField(module.id, { estimatedEndDate: next });
  };

  const deliveryDraft = (moduleId: string) => deliveryDrafts[moduleId] ?? EMPTY_DELIVERY_DRAFT;
  const setDeliveryDraft = (moduleId: string, patch: Partial<DeliveryDraft>) =>
    setDeliveryDrafts((prev) => ({ ...prev, [moduleId]: { ...deliveryDraft(moduleId), ...patch } }));

  const onAddDelivery = async (moduleId: string) => {
    const draft = deliveryDraft(moduleId);
    if (!draft.estimatedDate) return;
    try {
      await addDelivery.mutateAsync({
        projectId: project.id,
        moduleId,
        input: { estimatedDate: draft.estimatedDate, teamId: draft.teamId || undefined },
      });
      setDeliveryDrafts((prev) => ({ ...prev, [moduleId]: EMPTY_DELIVERY_DRAFT }));
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo agregar la entrega.');
    }
  };

  const onRemoveDelivery = async (moduleId: string, deliveryId: string) => {
    try {
      await removeDelivery.mutateAsync({ projectId: project.id, moduleId, deliveryId });
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo quitar la entrega.');
    }
  };

  const estadoOptions = ESTADO_OPTIONS_BY_TIPO[tipo];
  const totalTeamHours = teamsValue.reduce((sum, team) => sum + (Number(team.assignedHours) || 0), 0);

  const handleTipoChange = (nextTipo: ProjectTipo) => {
    setTipo(nextTipo);
    const mappedSalesStage = TIPO_TO_SALES_STAGE[nextTipo];
    if (mappedSalesStage) setValue('salesStage', mappedSalesStage, { shouldValidate: true });
    const options = ESTADO_OPTIONS_BY_TIPO[nextTipo];
    if (!options.includes(estado)) setEstado(options[0] ?? 'draft');
  };

  const toggleTeam = (teamId: string) => {
    const index = teamFields.findIndex((field) => field.teamId === teamId);
    if (index >= 0) removeTeam(index);
    else appendTeam({ teamId, leaderUserId: undefined, memberCount: undefined, assignedHours: undefined });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await updateProject.mutateAsync({ projectId: project.id, input: values });
      if (isDevelopment && estado !== project.status) {
        await changeStatus.mutateAsync({ projectId: project.id, input: { status: estado } });
      }
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
                label="Tipo de proyecto"
                options={TIPO_OPTIONS}
                value={tipo}
                onChange={(event) => handleTipoChange(event.target.value as ProjectTipo)}
              />
            )}
            {isDevelopment && (
              <Select
                label="Estado"
                options={estadoOptions.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }))}
                value={estado}
                disabled={tipo === 'finalizado'}
                onChange={(event) => setEstado(event.target.value as ProjectStatus)}
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

        {isDevelopment && tipo === 'aprobado' && estado === 'on_hold' && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Proyecto detenido</h3>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="onHoldReason">
                Motivo del detenimiento
              </label>
              <textarea
                id="onHoldReason"
                className={styles.textarea}
                placeholder="Ej. Cliente en pausa de presupuesto, a la espera de definición de alcance, etc."
                {...register('onHoldReason')}
              />
            </div>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" {...register('stopsClock')} />
              Detener el reloj del proyecto (Stop de Reloj)
            </label>
            <p className={styles.hint}>
              Mientras esté activo, este período no cuenta para plazos ni cálculo de desviación.
            </p>
          </div>
        )}

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

          {isDevelopment && (tipo === 'prospecto' || tipo === 'cotizacion') && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="scopeNotes">
                Notas de alcance
              </label>
              <textarea
                id="scopeNotes"
                className={styles.textarea}
                placeholder="Alcance conversado con el cliente, supuestos, exclusiones…"
                {...register('scopeNotes')}
              />
            </div>
          )}

          {isDevelopment && teamFields.length > 0 && (
            <div className={styles.readonlyBox}>
              <span>Horas totales (equipos)</span>
              <span className={styles.readonlyValue}>{totalTeamHours} hh</span>
            </div>
          )}
        </div>

        {isDevelopment && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Equipos e involucrados</h3>
            <label className={styles.label}>Equipos disponibles</label>
            <div className={styles.teamsGrid}>
              {(teamsCatalog?.items ?? []).map((team) => {
                const checked = teamFields.some((field) => field.teamId === team.id);
                return (
                  <label key={team.id} className={styles.teamCheckbox}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTeam(team.id)} />
                    {team.name}
                  </label>
                );
              })}
            </div>

            {teamFields.length > 0 && (
              <div className={styles.teamsSelected}>
                {teamFields.map((field, index) => (
                  <div key={field.id} className={styles.teamDetailCard}>
                    <span className={styles.teamDetailName}>
                      {teamsCatalog?.items.find((t) => t.id === field.teamId)?.name ??
                        project.teams.find((t) => t.teamId === field.teamId)?.teamName ??
                        '—'}
                    </span>
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
            )}
          </div>
        )}

        {isDevelopment && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Fases · Módulos</h3>
            <p className={styles.hint}>
              Unidades de entrega del proyecto, con sus entregas estimadas. Las tareas de cada fase (con su
              equipo, fechas y ámbito) se crean desde la ficha del proyecto (tab Roadmap y vista de líder de
              equipo) — son las que van dibujando el avance real.
            </p>

            {project.modules.length === 0 && <p className={styles.hint}>Aún no hay módulos.</p>}

            <div className={styles.modulesList}>
              {project.modules.map((module, index) => (
                <div key={module.id} className={styles.moduleEditCard}>
                  <div className={styles.moduleEditHead}>
                    <span>
                      Fase {index + 1} — {module.name} ({PROJECT_MODULE_STAGE_LABELS[module.initialStage]})
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void onDeleteModule(module.id, module.name)}
                      aria-label={`Eliminar ${module.name}`}
                    >
                      <TrashIcon size={16} />
                    </Button>
                  </div>

                  <div className={styles.moduleEditSubsection}>
                    <span className={styles.moduleEditSubsectionLabel}>Datos de la fase</span>
                    <TextField
                      label="Nombre del módulo"
                      value={moduleDraft(module).name}
                      onChange={(event) => setModuleDraftField(module, { name: event.target.value })}
                      onBlur={() => onBlurModuleName(module)}
                    />
                    <TextField
                      label="Horas estimadas"
                      type="number"
                      min={0}
                      value={moduleDraft(module).estimatedHours}
                      onChange={(event) => setModuleDraftField(module, { estimatedHours: event.target.value })}
                      onBlur={() => onBlurModuleHours(module)}
                    />
                    <div className={styles.row}>
                      <TextField
                        label="Fecha de inicio estimada"
                        type="date"
                        value={moduleDraft(module).estimatedStartDate}
                        onChange={(event) => setModuleDraftField(module, { estimatedStartDate: event.target.value })}
                        onBlur={() => onBlurModuleStartDate(module)}
                      />
                      <TextField
                        label="Fecha de término estimada"
                        type="date"
                        value={moduleDraft(module).estimatedEndDate}
                        onChange={(event) => setModuleDraftField(module, { estimatedEndDate: event.target.value })}
                        onBlur={() => onBlurModuleEndDate(module)}
                      />
                    </div>
                  </div>

                  <div className={styles.moduleEditSubsection}>
                    <span className={styles.moduleEditSubsectionLabel}>Entregas estimadas</span>
                    {module.deliveries.length > 0 && (
                      <div className={styles.moduleEditDeliveryList}>
                        {module.deliveries.map((delivery) => (
                          <div key={delivery.id} className={styles.moduleEditRow}>
                            <span>
                              {delivery.teamName ? `${delivery.teamName} · ` : ''}
                              {delivery.estimatedDate} · {PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => void onRemoveDelivery(module.id, delivery.id)}
                              aria-label="Quitar entrega"
                            >
                              <CloseIcon size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.moduleEditAddRow}>
                      <Select
                        className={styles.moduleEditAddField}
                        placeholder="Equipo (opcional)"
                        options={(teamsCatalog?.items ?? []).map((team) => ({ value: team.id, label: team.name }))}
                        value={deliveryDraft(module.id).teamId}
                        onChange={(event) => setDeliveryDraft(module.id, { teamId: event.target.value })}
                      />
                      <TextField
                        className={styles.moduleEditAddField}
                        type="date"
                        value={deliveryDraft(module.id).estimatedDate}
                        onChange={(event) => setDeliveryDraft(module.id, { estimatedDate: event.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        iconLeft={<PlusIcon size={14} />}
                        disabled={!deliveryDraft(module.id).estimatedDate}
                        onClick={() => void onAddDelivery(module.id)}
                      >
                        Agregar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showNewModuleForm ? (
              <div className={styles.newModuleForm}>
                <TextField
                  label="Nombre del módulo"
                  placeholder="Ej. Login y registro"
                  errorText={newModuleForm.formState.errors.name?.message}
                  {...newModuleForm.register('name')}
                />
                <div className={styles.row3}>
                  <Select label="Etapa inicial" options={MODULE_STAGE_OPTIONS} {...newModuleForm.register('initialStage')} />
                  <TextField
                    label="Horas estimadas"
                    type="number"
                    min={0}
                    {...newModuleForm.register('estimatedHours', { setValueAs: emptyToUndefined })}
                  />
                </div>
                <div className={styles.row3}>
                  <TextField
                    label="Fecha de inicio estimada"
                    type="date"
                    {...newModuleForm.register('estimatedStartDate', { setValueAs: emptyToUndefined })}
                  />
                  <TextField
                    label="Fecha de término estimada"
                    type="date"
                    {...newModuleForm.register('estimatedEndDate', { setValueAs: emptyToUndefined })}
                  />
                </div>

                <div className={styles.moduleDeliveries}>
                  <span className={styles.moduleEditSubsectionLabel}>Entregas estimadas</span>
                  {newModuleDeliveries.map((delivery, index) => (
                    <div key={delivery.localId} className={styles.deliveryRow}>
                      <span className={styles.deliveryLabel}>Entrega {index + 1}</span>
                      <TextField
                        className={styles.deliveryInputWrapper}
                        type="date"
                        value={delivery.estimatedDate}
                        onChange={(event) => updateNewModuleDeliveryDate(delivery.localId, event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewModuleDelivery(delivery.localId)}
                        aria-label={`Quitar entrega ${index + 1}`}
                      >
                        <CloseIcon size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" iconLeft={<PlusIcon size={14} />} onClick={addNewModuleDelivery}>
                    Agregar entrega
                  </Button>
                  <p className={styles.hint}>Cada entrega crea automáticamente un hito "Entrega a cliente" en estado Planificada.</p>
                </div>

                <div className={styles.newModuleActions}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowNewModuleForm(false);
                      setNewModuleDeliveries([]);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    loading={newModuleForm.formState.isSubmitting}
                    loadingText="Agregando…"
                    onClick={() => void onCreateModule()}
                  >
                    Agregar módulo
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                iconLeft={<PlusIcon size={16} />}
                onClick={() => setShowNewModuleForm(true)}
              >
                Agregar fase / módulo
              </Button>
            )}
          </div>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Documentación</h3>
          <div className={styles.row}>
            <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
            <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
          </div>
          {isDevelopment && tipo === 'finalizado' && (
            <TextField
              label="Documentación de entrega"
              placeholder="Adjuntar o enlazar documentación final"
              {...register('deliveryDocumentation')}
            />
          )}
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
    onHoldReason: project.onHoldReason ?? '',
    stopsClock: project.stopsClock,
    scopeNotes: project.scopeNotes ?? '',
    deliveryDocumentation: project.deliveryDocumentation ?? '',
    teams: project.teams.map((team) => ({
      teamId: team.teamId,
      leaderUserId: team.leader?.id ?? undefined,
      memberCount: team.memberCount ?? undefined,
      assignedHours: team.assignedHours ?? undefined,
    })),
  };
}
