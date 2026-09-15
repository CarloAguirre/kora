import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createProjectSchema,
  PROJECT_MODULE_STAGES,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_SALES_STAGES,
  PROJECT_SALES_STAGE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  type ClientDetail,
  type CreateProjectInput,
  type CreateProjectModuleInput,
  type ProjectModuleStage,
  type ProjectPriority,
  type ProjectType,
} from '@kora/contracts';
import styles from './NewProjectPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { Stepper } from '@/shared/components/ui/Stepper';
import { AlertIcon, ChevronLeftIcon, CloseIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useAddProjectModuleDelivery, useCreateProject, useCreateProjectModule } from '../api/projects.queries';
import { useClientsList, useClientDetail } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { ApiRequestError } from '@/shared/lib/api-client';

type ProjectFormValues = z.input<typeof createProjectSchema>;

const TYPE_OPTIONS = PROJECT_TYPES.map((type) => ({ value: type, label: PROJECT_TYPE_LABELS[type] }));
const SALES_STAGE_OPTIONS = PROJECT_SALES_STAGES.map((stage) => ({
  value: stage,
  label: PROJECT_SALES_STAGE_LABELS[stage],
}));
/** Mismo orden que la v1 (Alta/Media/Baja), no el orden alfabético del enum. */
const PRIORITY_ORDER: readonly ProjectPriority[] = ['high', 'medium', 'low'];
const PRIORITY_OPTIONS = PRIORITY_ORDER.map((priority) => ({ value: priority, label: PROJECT_PRIORITY_LABELS[priority] }));
const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
/** Subconjunto creatable de `PROJECT_STATUSES` — mismo orden que "Estado" en la v1. */
const STATUS_OPTIONS = (['active', 'draft', 'on_hold'] as const).map((status) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}));

const STEPS = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
  { label: 'Fases · Módulos' },
  { label: 'Resumen y confirmación' },
];

const MODULE_STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));

/** Convierte el `''` de un `<select>` sin elegir a `undefined`, para que los campos `nullish()` del contrato no reciban una cadena vacía. */
const emptyToUndefined = (value: string) => value || undefined;

interface DeliveryDraft {
  localId: number;
  estimatedDate: string;
}

/**
 * Un módulo mientras se arma en el wizard: campos como texto plano de
 * formulario (no el `CreateProjectModuleInput` final) porque se edita en
 * línea, tecla a tecla, apenas se agrega la tarjeta — no hay un paso de
 * "completar y confirmar" aparte como en `EditProjectDialog` (que sí llama
 * a la API de inmediato porque el proyecto ya existe). La conversión a
 * `CreateProjectModuleInput` ocurre recién al enviar el formulario completo.
 */
interface ModuleDraft {
  localId: number;
  name: string;
  initialStage: ProjectModuleStage;
  estimatedHours: string;
  estimatedStartDate: string;
  estimatedEndDate: string;
  deliveries: DeliveryDraft[];
}

const EMPTY_MODULE_DRAFT: Omit<ModuleDraft, 'localId'> = {
  name: '',
  initialStage: 'discovery',
  estimatedHours: '',
  estimatedStartDate: '',
  estimatedEndDate: '',
  deliveries: [],
};

/** Encabezado de sección — mismo peso visual para todas, con línea divisoria entre secciones (ver `.module.css`). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

/** Tarjeta de detalle del cliente — mismos campos y orden que la v1 (`Empresa` → `Celular`). */
function ClientDetailCard({ client }: { client: ClientDetail }) {
  const primaryContact = client.contacts.find(
    (contact) => contact.name === client.primaryContactName && contact.email === client.primaryContactEmail,
  );

  return (
    <div className={styles.clientCard}>
      <ClientRow label="Empresa" value={client.companyName} />
      <ClientRow label="Razón social" value={client.legalName} />
      <ClientRow label="Rut/Identificador" value={client.taxId} />
      <ClientRow label="Giro" value={client.industry?.name} />
      <ClientRow label="Sitio web" value={client.website} />
      <ClientRow label="Dirección" value={client.address} />
      <ClientRow label="Comuna" value={client.comuna?.name} />
      <ClientRow label="País" value={client.country?.name} />
      <ClientRow label="Nombre contacto" value={client.primaryContactName} />
      <ClientRow label="Cargo" value={primaryContact?.position} />
      <ClientRow label="Correo electrónico" value={client.primaryContactEmail} />
      <ClientRow label="Celular" value={client.primaryContactPhone} />
    </div>
  );
}

function ClientRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={styles.clientRow}>
      <span className={styles.clientLabel}>{label}</span>
      <span className={styles.clientValue}>{value || '-'}</span>
    </div>
  );
}

export function NewProjectPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createProject = useCreateProject();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId') ?? '';
  const [step, setStep] = useState(preselectedClientId ? 1 : 0);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues, unknown, CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      type: 'development',
      salesStage: 'prospect',
      soldHours: 0,
      supportHours: 0,
      clientId: preselectedClientId,
      teams: [],
    },
  });

  const { fields: teamFields, append: appendTeam, remove: removeTeam } = useFieldArray({ control, name: 'teams' });

  const clientId = watch('clientId');
  const type = watch('type') as ProjectType;
  const salesStage = watch('salesStage');
  const status = watch('status');
  const leaderUserId = watch('leaderUserId');
  const soldHours = watch('soldHours');
  const quotationLink = watch('quotationLink');
  const contractLink = watch('contractLink');
  const additionalLinks = watch('additionalLinks');
  const teamsValue = watch('teams') ?? [];

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: clientDetail } = useClientDetail(clientId || null);
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });
  const { data: teams } = useTeamsList({ page: 1, pageSize: 50, sortField: 'name' });

  const leaderLabel = leaders?.items.find((u) => u.id === leaderUserId)?.fullName;

  // Mismas reglas de habilitado que v1: "Estado" solo con Etapa comercial = Aprobado; "Etapa" además
  // exige Estado = Activo; "Equipos" exige Aprobado (no depende de Estado, igual que en v1).
  const isApproved = salesStage === 'approved';
  const isProspecto = salesStage === 'prospect';
  const statusEnabled = isApproved;
  const phaseEnabled = isApproved && status === 'active';
  const equiposEnabled = type === 'development' && isApproved;

  const toggleTeam = (teamId: string) => {
    const index = teamFields.findIndex((field) => field.teamId === teamId);
    if (index >= 0) removeTeam(index);
    else appendTeam({ teamId, leaderUserId: undefined, memberCount: undefined, assignedHours: undefined });
  };

  const totalTeamHours = teamsValue.reduce((sum, team) => sum + (Number(team.assignedHours) || 0), 0);
  const hoursExceeded = equiposEnabled && totalTeamHours > (Number(soldHours) || 0);

  // Los módulos aún no tienen dónde vivir en el backend: el proyecto no existe
  // hasta el submit final. Se acumulan acá y recién se crean (uno por uno,
  // reusando `useCreateProjectModule`, igual que hace `EditProjectDialog` para
  // un proyecto ya existente) justo después de que `createProject` responde.
  const createModule = useCreateProjectModule();
  const addDelivery = useAddProjectModuleDelivery();
  const [moduleDrafts, setModuleDrafts] = useState<ModuleDraft[]>([]);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const nextModuleLocalId = useRef(1);
  const nextDeliveryLocalId = useRef(1);

  const addModuleDraft = () => {
    setModuleDrafts((prev) => [...prev, { ...EMPTY_MODULE_DRAFT, localId: nextModuleLocalId.current++ }]);
  };

  const removeModuleDraft = (localId: number) => {
    setModuleDrafts((prev) => prev.filter((draft) => draft.localId !== localId));
  };

  const updateModuleDraft = <K extends keyof Omit<ModuleDraft, 'localId' | 'deliveries'>>(
    localId: number,
    field: K,
    value: ModuleDraft[K],
  ) => {
    setModuleDrafts((prev) => prev.map((draft) => (draft.localId === localId ? { ...draft, [field]: value } : draft)));
  };

  const addDeliveryDraft = (moduleLocalId: number) => {
    setModuleDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === moduleLocalId
          ? { ...draft, deliveries: [...draft.deliveries, { localId: nextDeliveryLocalId.current++, estimatedDate: '' }] }
          : draft,
      ),
    );
  };

  const removeDeliveryDraft = (moduleLocalId: number, deliveryLocalId: number) => {
    setModuleDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === moduleLocalId
          ? { ...draft, deliveries: draft.deliveries.filter((delivery) => delivery.localId !== deliveryLocalId) }
          : draft,
      ),
    );
  };

  const updateDeliveryDraftDate = (moduleLocalId: number, deliveryLocalId: number, estimatedDate: string) => {
    setModuleDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === moduleLocalId
          ? {
              ...draft,
              deliveries: draft.deliveries.map((delivery) =>
                delivery.localId === deliveryLocalId ? { ...delivery, estimatedDate } : delivery,
              ),
            }
          : draft,
      ),
    );
  };

  const goToStep2 = () => setStep(1);

  const goToFasesModulos = async () => {
    const fields: Array<keyof ProjectFormValues> = ['name', 'type'];
    if (type === 'development') fields.push('salesStage');
    const valid = await trigger(fields);
    if (valid && !hoursExceeded) setStep(2);
  };

  const goToResumen = () => {
    if (moduleDrafts.some((draft) => !draft.name.trim())) {
      setModuleError('Ponle un nombre a todos los módulos agregados antes de continuar.');
      return;
    }
    setModuleError(null);
    setStep(3);
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createProject.mutateAsync(values);
      if (moduleDrafts.length > 0) {
        await Promise.all(
          moduleDrafts
            .filter((draft) => draft.name.trim())
            .map(async (draft) => {
              const input: CreateProjectModuleInput = {
                name: draft.name.trim(),
                initialStage: draft.initialStage,
                estimatedHours: draft.estimatedHours ? Number(draft.estimatedHours) : undefined,
                estimatedStartDate: draft.estimatedStartDate || undefined,
                estimatedEndDate: draft.estimatedEndDate || undefined,
              };
              const module = await createModule.mutateAsync({ projectId: result.id, input });
              const pendingDeliveries = draft.deliveries.filter((delivery) => delivery.estimatedDate);
              if (pendingDeliveries.length > 0) {
                await Promise.all(
                  pendingDeliveries.map((delivery) =>
                    addDelivery.mutateAsync({
                      projectId: result.id,
                      moduleId: module.id,
                      input: { estimatedDate: delivery.estimatedDate },
                    }),
                  ),
                );
              }
            }),
        );
      }
      toast.success(`Se creó el proyecto ${values.name}.`);
      void navigate(`/proyectos/${result.id}`);
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo crear el proyecto.');
    }
  });

  return (
    <DashboardLayout title="Nuevo proyecto">
      <div className={styles.header}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver"
          onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
        >
          <ChevronLeftIcon size={20} />
        </Button>
        <h1 className={styles.title}>Nuevo proyecto</h1>
      </div>

      <Stepper steps={STEPS} activeIndex={step} />

      <Card>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {serverError && (
            <div className={styles.alert} role="alert">
              <AlertIcon size={18} className={styles.alertIcon} />
              <span>{serverError}</span>
            </div>
          )}

          {step === 0 && (
            <>
              <Section title="Seleccionar cliente">
                <Combobox
                  className={styles.clientField}
                  label="Cliente"
                  placeholder="Buscar cliente…"
                  options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
                  value={clientId ?? ''}
                  onChange={(nextClientId) => setValue('clientId', nextClientId, { shouldValidate: true })}
                  emptyMessage="No se encontraron clientes."
                />
                <p className={styles.hint}>
                  ¿No encuentras el cliente?{' '}
                  <Link className={styles.hintLink} to="/clientes">
                    Créalo primero
                  </Link>
                  .
                </p>

                {clientDetail && <ClientDetailCard client={clientDetail} />}
              </Section>

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" disabled={!clientId} onClick={goToStep2}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Section title="Datos del Proyecto">
                <TextField label="Nombre del proyecto" required errorText={errors.name?.message} {...register('name')} />

                <div className={styles.row}>
                  <Select label="Tipo de proyecto" required options={TYPE_OPTIONS} {...register('type')} />
                  {type === 'development' && (
                    <Select
                      label="Etapa comercial"
                      required
                      options={SALES_STAGE_OPTIONS}
                      errorText={errors.salesStage?.message}
                      {...register('salesStage')}
                    />
                  )}
                  {type === 'development' && (
                    <Select
                      label="Estado"
                      placeholder={statusEnabled ? 'Sin definir' : 'Disponible al aprobar'}
                      disabled={!statusEnabled}
                      options={STATUS_OPTIONS}
                      {...register('status', { setValueAs: emptyToUndefined })}
                    />
                  )}
                  {type === 'development' && (
                    <Select
                      label="Etapa"
                      placeholder={phaseEnabled ? 'Sin definir' : 'Disponible al aprobar y activo'}
                      disabled={!phaseEnabled}
                      options={PHASE_OPTIONS}
                      {...register('phase', { setValueAs: emptyToUndefined })}
                    />
                  )}
                  <Select label="Prioridad" placeholder="Sin definir" options={PRIORITY_OPTIONS} {...register('priority', { setValueAs: emptyToUndefined })} />
                </div>

                <Select
                  className={styles.leaderField}
                  label="Líder Kabeli a cargo"
                  placeholder="Sin asignar"
                  options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                  {...register('leaderUserId', { setValueAs: emptyToUndefined })}
                />
              </Section>

              <Section title="Documentación del proyecto">
                <div className={styles.row}>
                  <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
                  <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
                  <TextField label="Adicionales" placeholder="Agregar un link" {...register('additionalLinks')} />
                </div>
              </Section>

              <Section title="Estimación del Proyecto">
                <div className={styles.row}>
                  <TextField label="Fecha de inicio" type="date" disabled={isProspecto} {...register('startDate', { setValueAs: emptyToUndefined })} />
                  <TextField
                    label="Fecha de fin"
                    type="date"
                    disabled={isProspecto}
                    {...register('estimatedDeliveryDate', { setValueAs: emptyToUndefined })}
                  />
                  <TextField label="Horas" type="number" disabled={isProspecto} {...register('soldHours')} />
                </div>
                {type === 'support' && (
                  <div className={styles.row}>
                    <TextField label="Horas de soporte" type="number" {...register('supportHours')} />
                    <TextField label="Plan de soporte" placeholder="Ej: Mensual, Bolsa de horas…" {...register('supportPlanDescription')} />
                  </div>
                )}
              </Section>

              {type === 'development' && (
                <Section title="Equipos e involucrados">
                  {!equiposEnabled && <p className={styles.hint}>Disponible cuando la etapa comercial es "Aprobado".</p>}

                  <div className={styles.teamsLayout}>
                    <div className={styles.teamsAvailable}>
                      <h3 className={styles.teamsSubtitle}>Equipos disponibles</h3>
                      <div className={styles.teamsGrid}>
                        {(teams?.items ?? []).map((team) => {
                          const checked = teamFields.some((field) => field.teamId === team.id);
                          return (
                            <label
                              key={team.id}
                              className={[styles.teamCheckbox, !equiposEnabled ? styles.teamCheckboxDisabled : '']
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!equiposEnabled}
                                onChange={() => toggleTeam(team.id)}
                              />
                              {team.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {equiposEnabled && teamFields.length > 0 && (
                      <div className={styles.teamsSelected}>
                        <h3 className={styles.teamsSubtitle}>Equipos seleccionados</h3>
                        {teamFields.map((field, index) => {
                          const teamName = teams?.items.find((t) => t.id === field.teamId)?.name ?? '—';
                          return (
                            <div key={field.id} className={styles.teamDetailCard}>
                              <span className={styles.teamDetailName}>{teamName}</span>
                              <div className={styles.row}>
                                <Select
                                  label="Líder"
                                  placeholder="Sin asignar"
                                  options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                                  {...register(`teams.${index}.leaderUserId`, { setValueAs: emptyToUndefined })}
                                />
                                <TextField label="N° colaboradores" type="number" min={0} {...register(`teams.${index}.memberCount`)} />
                                <TextField label="Horas estimadas" type="number" min={0} {...register(`teams.${index}.assignedHours`)} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {hoursExceeded && (
                    <div className={styles.alert} role="alert">
                      <AlertIcon size={18} className={styles.alertIcon} />
                      <span>
                        La suma de horas estimadas de los equipos ({totalTeamHours} hrs) supera las horas asignadas al proyecto (
                        {Number(soldHours) || 0} hrs). Ajusta las horas antes de continuar.
                      </span>
                    </div>
                  )}
                </Section>
              )}

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(0)}>
                  Atrás
                </Button>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" disabled={hoursExceeded} onClick={() => void goToFasesModulos()}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Section title="Fases · Módulos">
                {!equiposEnabled ? (
                  <p className={styles.hint}>Disponible cuando la etapa comercial es "Aprobado".</p>
                ) : (
                  <>
                    <p className={styles.hint}>
                      Unidades de entrega del proyecto — cada una recorre las etapas del sistema (Levantamiento →
                      Desarrollo → Producción → Marcha blanca → Finalizado) de forma independiente. Los tramos de
                      equipo se agregan después, desde la ficha del proyecto.
                    </p>

                    {moduleError && (
                      <div className={styles.alert} role="alert">
                        <AlertIcon size={18} className={styles.alertIcon} />
                        <span>{moduleError}</span>
                      </div>
                    )}

                    {moduleDrafts.length === 0 && <p className={styles.hint}>Aún no hay módulos.</p>}

                    <div className={styles.modulesList}>
                      {moduleDrafts.map((draft, index) => (
                        <div key={draft.localId} className={styles.moduleCard}>
                          <div className={styles.moduleCardHead}>
                            <span className={styles.moduleKicker}>Fase {index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={styles.iconDanger}
                              onClick={() => removeModuleDraft(draft.localId)}
                              aria-label={`Eliminar fase ${index + 1}`}
                            >
                              <TrashIcon size={16} />
                            </Button>
                          </div>

                          <TextField
                            label="Nombre del módulo"
                            placeholder="Ej. Login y registro"
                            value={draft.name}
                            onChange={(event) => updateModuleDraft(draft.localId, 'name', event.target.value)}
                          />

                          <div className={styles.row3}>
                            <Select
                              label="Etapa inicial"
                              options={MODULE_STAGE_OPTIONS}
                              value={draft.initialStage}
                              onChange={(event) =>
                                updateModuleDraft(draft.localId, 'initialStage', event.target.value as ProjectModuleStage)
                              }
                            />
                            <TextField
                              label="Horas estimadas"
                              type="number"
                              min={0}
                              value={draft.estimatedHours}
                              onChange={(event) => updateModuleDraft(draft.localId, 'estimatedHours', event.target.value)}
                            />
                          </div>

                          <div className={styles.row3}>
                            <TextField
                              label="Fecha de inicio estimada"
                              type="date"
                              value={draft.estimatedStartDate}
                              onChange={(event) => updateModuleDraft(draft.localId, 'estimatedStartDate', event.target.value)}
                            />
                            <TextField
                              label="Fecha de término estimada"
                              type="date"
                              value={draft.estimatedEndDate}
                              onChange={(event) => updateModuleDraft(draft.localId, 'estimatedEndDate', event.target.value)}
                            />
                          </div>

                          <div className={styles.moduleDeliveries}>
                            <span className={styles.moduleDeliveriesLabel}>Entregas estimadas</span>
                            {draft.deliveries.map((delivery, deliveryIndex) => (
                              <div key={delivery.localId} className={styles.deliveryRow}>
                                <span className={styles.deliveryLabel}>Entrega {deliveryIndex + 1}</span>
                                <TextField
                                  type="date"
                                  className={styles.deliveryInputWrapper}
                                  value={delivery.estimatedDate}
                                  onChange={(event) => updateDeliveryDraftDate(draft.localId, delivery.localId, event.target.value)}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className={styles.iconDanger}
                                  onClick={() => removeDeliveryDraft(draft.localId, delivery.localId)}
                                  aria-label={`Quitar entrega ${deliveryIndex + 1}`}
                                >
                                  <CloseIcon size={14} />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              iconLeft={<PlusIcon size={14} />}
                              onClick={() => addDeliveryDraft(draft.localId)}
                            >
                              Agregar entrega
                            </Button>
                            <p className={styles.deliveryHint}>
                              Cada entrega crea automáticamente un hito "Entrega a cliente" en estado Planificada.
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button type="button" variant="outline" iconLeft={<PlusIcon size={16} />} onClick={addModuleDraft}>
                      Agregar fase / módulo
                    </Button>
                  </>
                )}
              </Section>

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" onClick={goToResumen}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Section title="Datos Proyecto">
                <div className={styles.summaryGrid}>
                  <SummaryItem label="Nombre del proyecto" value={watch('name')} />
                  <SummaryItem label="Tipo" value={type === 'development' && salesStage ? PROJECT_SALES_STAGE_LABELS[salesStage] : PROJECT_TYPE_LABELS[type]} />
                  <SummaryItem label="Líder" value={leaderLabel} />
                  <SummaryItem label="Cotización" value={quotationLink} />
                  <SummaryItem label="Contrato" value={contractLink} />
                  <SummaryItem label="Adicionales" value={additionalLinks} />
                  {equiposEnabled && <SummaryItem label="Fases · Módulos" value={moduleDrafts.length ? `${moduleDrafts.length}` : undefined} />}
                </div>
              </Section>

              {clientDetail && (
                <Section title="Cliente">
                  <ClientDetailCard client={clientDetail} />
                </Section>
              )}

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button type="submit" loading={isSubmitting} loadingText="Creando…">
                  Guardar y Crear Proyecto
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </DashboardLayout>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value || '—'}</span>
    </div>
  );
}
