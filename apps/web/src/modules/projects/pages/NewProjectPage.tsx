import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CLIENT_STATUS_LABELS,
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
  SUPPORT_PLAN_CURRENCIES,
  SUPPORT_PLAN_CURRENCY_LABELS,
  SUPPORT_PLAN_TYPE_LABELS,
  SUPPORT_SURPLUS_POLICY_LABELS,
  SUPPORT_SURPLUS_POLICIES,
  type ClientDetail,
  type CreateProjectInput,
  type CreateProjectModuleInput,
  type CreateSupportPlanInput,
  type ProjectModuleStage,
  type ProjectPriority,
  type ProjectType,
  type SupportPlanCurrency,
  type SupportPlanType,
  type SupportSurplusPolicy,
} from '@kora/contracts';
import styles from './NewProjectPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { MoneyField } from '@/shared/components/ui/MoneyField';
import { Stepper } from '@/shared/components/ui/Stepper';
import { AlertIcon, ChevronLeftIcon, CloseIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useAddProjectModuleDelivery, useCreateProject, useCreateProjectModule, useProjectsList } from '../api/projects.queries';
import { useCreateSupportPlan, useCreateSupportProject } from '../api/support-plan.queries';
import { useClientsList, useClientDetail, useUpdateClient } from '@/modules/clients/api/clients.queries';
import { clientsApi } from '@/modules/clients/api/clients.api';
import { ClientFormDialog } from '@/modules/clients/components/ClientFormDialog';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { formatMoney } from '@/shared/lib/format-money';
import { projectPath, supportPlanPath } from '@/app/router/paths';

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

/** Desarrollo tiene "Fases · Módulos" donde soporte tiene "Configuración de soporte" — mismo índice de paso (2) en ambos flujos. */
const STEPS_DEVELOPMENT = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
  { label: 'Fases · Módulos' },
  { label: 'Resumen y confirmación' },
];
const STEPS_SUPPORT = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
  { label: 'Configuración de soporte' },
  { label: 'Resumen y confirmación' },
];

const MODULE_STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));

/** Convierte el `''` de un `<select>` sin elegir a `undefined`, para que los campos `nullish()` del contrato no reciban una cadena vacía. */
const emptyToUndefined = (value: string) => value || undefined;

/** Mismo orden que el prototipo de referencia (Bolsa/Mensual/A demanda), no el orden del enum. */
const SUPPORT_PLAN_TYPE_SEGMENTED_OPTIONS = (['bundle', 'monthly', 'on_demand'] as const).map((planType) => ({
  value: planType,
  label: SUPPORT_PLAN_TYPE_LABELS[planType],
}));
const SUPPORT_CURRENCY_OPTIONS = SUPPORT_PLAN_CURRENCIES.map((currency) => ({ value: currency, label: SUPPORT_PLAN_CURRENCY_LABELS[currency] }));
const SUPPORT_SURPLUS_POLICY_OPTIONS = SUPPORT_SURPLUS_POLICIES.map((policy) => ({
  value: policy,
  label: SUPPORT_SURPLUS_POLICY_LABELS[policy],
}));
const SUPPORT_SLA_HOUR_OPTIONS = ['2', '4', '8', '24', '48'].map((h) => ({ value: h, label: `${h} horas` }));
const SUPPORT_DUE_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

function dayOfIsoDate(isoDate: string): number {
  const [, month, day] = isoDate.split('-');
  return Number(day ?? month ?? 1);
}

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
  const createSupportProject = useCreateSupportProject();
  const createSupportPlan = useCreateSupportPlan();
  const updateClient = useUpdateClient();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId') ?? '';
  const [step, setStep] = useState(preselectedClientId ? 1 : 0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [dueDayTouched, setDueDayTouched] = useState(false);

  // Soporte: proyectos de desarrollo terminados a consolidar en el contrato — no viven en el
  // formulario porque el endpoint "desde cero" (`createSupportProject`) no los conoce, mismo
  // criterio que `moduleDrafts` para Fases · Módulos. Ver `CreateSupportPlanUseCase`.
  const [developmentProjectIds, setDevelopmentProjectIds] = useState<string[]>([]);
  const [useClientContact, setUseClientContact] = useState(true);
  const [contactName, setContactName] = useState('');
  const [contactPosition, setContactPosition] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consolidateError, setConsolidateError] = useState<string | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);

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
      supportCurrency: 'UF',
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
  const startDate = watch('startDate');
  const estimatedDeliveryDate = watch('estimatedDeliveryDate');
  const supportPlanType = watch('supportPlanType') as SupportPlanType | undefined;
  const supportSurplusPolicy = watch('supportSurplusPolicy') as SupportSurplusPolicy | undefined;
  const supportCurrency = (watch('supportCurrency') as SupportPlanCurrency | undefined) ?? 'UF';
  const supportPlanValueUf = watch('supportPlanValueUf');
  const supportExtraHourValueUf = watch('supportExtraHourValueUf');
  const supportDueDayOfMonth = watch('supportDueDayOfMonth');
  const supportHours = watch('supportHours');

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: clientDetail } = useClientDetail(clientId || null);
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });
  const { data: teams } = useTeamsList({ page: 1, pageSize: 50, sortField: 'name' });
  // Candidatos a consolidar en un contrato de soporte — mismo filtro que usaba el asistente "Nuevo
  // contrato de soporte" ya retirado: terminados, de desarrollo, del mismo cliente.
  const { data: finishedProjects } = useProjectsList({
    clientId: clientId || undefined,
    type: 'development',
    status: ['finished'],
    page: 1,
    pageSize: 200,
  });

  const leaderLabel = leaders?.items.find((u) => u.id === leaderUserId)?.fullName;

  // Mismas reglas de habilitado que v1: "Estado" solo con Etapa comercial = Aprobado; "Etapa" además
  // exige Estado = Activo; "Equipos" exige Aprobado (no depende de Estado, igual que en v1).
  const isApproved = salesStage === 'approved';
  const isProspecto = salesStage === 'prospect';
  const statusEnabled = isApproved;
  const phaseEnabled = isApproved && status === 'active';
  const equiposEnabled = type === 'development' && isApproved;

  const isSupport = type === 'support';
  const isSupportMonthly = isSupport && supportPlanType === 'monthly';
  const isSupportBundleOrMonthly = isSupport && (supportPlanType === 'bundle' || supportPlanType === 'monthly');
  const showSupportDueDay = isSupportMonthly && supportSurplusPolicy === 'expire';
  /** Con 1+ proyecto terminado marcado, esto deja de ser "un proyecto de soporte nuevo" y pasa a
   *  ser "un contrato que consolida proyectos ya hechos" — mismo criterio que tenía el asistente
   *  retirado (1 proyecto = alcance Único, 2+ = Consolidado; nunca se elige aparte). */
  const isConsolidating = isSupport && developmentProjectIds.length > 0;
  const contactLabel = useClientContact ? (clientDetail?.primaryContactName ?? 'Contacto del cliente') : contactName || '—';
  const pageTitle = isConsolidating ? 'Nuevo contrato de soporte' : 'Nuevo proyecto';

  const onSupportSurplusPolicyChange = (value: string) => {
    setValue('supportSurplusPolicy', (value || undefined) as SupportSurplusPolicy | undefined, { shouldValidate: true });
    if (value === 'expire' && !dueDayTouched && startDate) {
      setValue('supportDueDayOfMonth', dayOfIsoDate(startDate));
    }
  };

  /** Al desmarcar "usar el contacto del cliente" por primera vez, precarga el formulario libre con el contacto principal del cliente — el usuario parte de algo conocido en vez de una ficha en blanco. */
  const onToggleUseClientContact = (checked: boolean) => {
    setUseClientContact(checked);
    if (!checked && !contactName && clientDetail) {
      const primary = clientDetail.contacts.find(
        (c) => c.name === clientDetail.primaryContactName && c.email === clientDetail.primaryContactEmail,
      );
      setContactName(primary?.name ?? clientDetail.primaryContactName ?? '');
      setContactPosition(primary?.position ?? '');
      setContactPhone(primary?.phone ?? clientDetail.primaryContactPhone ?? '');
      setContactEmail(primary?.email ?? clientDetail.primaryContactEmail ?? '');
    }
  };

  /**
   * El contrato de soporte solo guarda un `primaryContactId` (un contacto ya existente del
   * cliente) — no hay campo para un contacto "suelto". Si lo editado coincide con un contacto
   * existente se reusa su id; si no, se agrega como contacto nuevo del cliente (mismo endpoint que
   * `ClientFormDialog`, reemplazando la lista completa de contactos) y se recupera su id recién
   * creado con una relectura del cliente.
   */
  const resolveProjectContactId = async (): Promise<string | undefined> => {
    if (useClientContact || !clientDetail) return undefined;
    const trimmedName = contactName.trim();
    if (!trimmedName) return undefined;

    const normalizedPosition = contactPosition.trim();
    const normalizedPhone = contactPhone.trim();
    const normalizedEmail = contactEmail.trim();

    const existing = clientDetail.contacts.find(
      (c) =>
        c.name === trimmedName &&
        (c.position ?? '') === normalizedPosition &&
        (c.phone ?? '') === normalizedPhone &&
        (c.email ?? '') === normalizedEmail,
    );
    if (existing) return existing.id;

    const existingIds = new Set(clientDetail.contacts.map((c) => c.id));
    await updateClient.mutateAsync({
      clientId: clientDetail.id,
      input: {
        contacts: [
          ...clientDetail.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position ?? undefined,
            email: c.email ?? undefined,
            phone: c.phone ?? undefined,
          })),
          {
            name: trimmedName,
            position: normalizedPosition || undefined,
            email: normalizedEmail || undefined,
            phone: normalizedPhone || undefined,
          },
        ],
      },
    });
    const refreshed = await clientsApi.detail(clientDetail.id);
    return refreshed.contacts.find((c) => !existingIds.has(c.id))?.id;
  };

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

  const goToStep3 = async () => {
    const fields: Array<keyof ProjectFormValues> = ['name', 'type'];
    if (type === 'development') fields.push('salesStage');
    const valid = await trigger(fields);
    if (!valid || hoursExceeded) return;
    setStep(2);
  };

  const goToResumen = () => {
    if (moduleDrafts.some((draft) => !draft.name.trim())) {
      setModuleError('Ponle un nombre a todos los módulos agregados antes de continuar.');
      return;
    }
    setModuleError(null);
    setStep(3);
  };

  const goToResumenFromSupportConfig = async () => {
    const valid = await trigger(['supportPlanType']);
    if (!valid) return;
    if (isConsolidating && !startDate) {
      setConsolidateError('La fecha de inicio es obligatoria para consolidar un contrato.');
      return;
    }
    setConsolidateError(null);
    setStep(3);
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (values.type === 'support') {
        if (developmentProjectIds.length > 0) {
          if (!values.startDate) {
            setServerError('La fecha de inicio es obligatoria para consolidar un contrato.');
            return;
          }
          const planInput: CreateSupportPlanInput = {
            clientId: values.clientId as string,
            developmentProjectIds,
            name: values.name,
            leaderUserId: values.leaderUserId,
            primaryContactId: await resolveProjectContactId(),
            quotationLink: values.quotationLink,
            contractLink: values.contractLink,
            additionalLinks: values.additionalLinks,
            targetHoursCritical: values.supportTargetHoursCritical,
            targetHoursHigh: values.supportTargetHoursHigh,
            targetHoursMedium: values.supportTargetHoursMedium,
            targetHoursLow: values.supportTargetHoursLow,
            startDate: values.startDate,
            endDate: values.estimatedDeliveryDate,
            planType: values.supportPlanType as SupportPlanType,
            surplusPolicy: values.supportSurplusPolicy,
            contractedHours: values.supportHours ?? 0,
            planValueUf: values.supportPlanValueUf ?? 0,
            extraHourValueUf: values.supportExtraHourValueUf ?? 0,
            currency: values.supportCurrency ?? 'UF',
            dueDayOfMonth: values.supportDueDayOfMonth,
          };
          const result = await createSupportPlan.mutateAsync(planInput);
          toast.success(`Se creó el contrato de soporte de ${values.name}.`);
          void navigate(supportPlanPath(result));
          return;
        }

        const result = await createSupportProject.mutateAsync({ ...values, primaryContactId: await resolveProjectContactId() });
        toast.success(`Se creó el proyecto y contrato de soporte de ${values.name}.`);
        // `result.id` es el proyecto (no el contrato) — la ficha de proyecto ya muestra el resumen
        // del plan vía `SupportProjectDetailView` (`useSupportPlanSummary(projectId)`).
        void navigate(projectPath(result));
        return;
      }

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
      void navigate(projectPath(result));
    } catch (error) {
      setServerError(error instanceof ApiRequestError ? error.message : 'No se pudo crear el proyecto.');
    }
  });

  return (
    <DashboardLayout title={pageTitle}>
      <div className={styles.header}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver"
          onClick={() => {
            if (step === 0) {
              navigate(-1);
              return;
            }
            setStep(step - 1);
          }}
        >
          <ChevronLeftIcon size={20} />
        </Button>
        <h1 className={styles.title}>{pageTitle}</h1>
      </div>

      <Stepper steps={isSupport ? STEPS_SUPPORT : STEPS_DEVELOPMENT} activeIndex={step} />

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
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Tipo de proyecto<span className={styles.required}>*</span>
                  </span>
                  <SegmentedControl
                    aria-label="Tipo de proyecto"
                    options={TYPE_OPTIONS}
                    value={type}
                    onChange={(value) => setValue('type', value as ProjectType, { shouldValidate: true })}
                    fullWidth
                  />
                </div>

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
                  <button type="button" className={styles.hintLink} onClick={() => setClientDialogOpen(true)}>
                    Créalo primero
                  </button>
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
                <TextField
                  label={isConsolidating ? 'Nombre del contrato' : 'Nombre del proyecto'}
                  required
                  errorText={errors.name?.message}
                  {...register('name')}
                />

                <div className={styles.row}>
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

              {isSupport && (
                <Section title="Proyectos terminados incluidos en este contrato">
                  <p className={styles.hint} style={{ marginTop: 0 }}>
                    Un contrato de soporte puede cubrir uno o varios proyectos terminados del mismo cliente. Sin
                    ninguno marcado se crea un proyecto de soporte nuevo desde cero. Con uno, el contrato queda
                    "Único". Con dos o más, queda "Consolidado": comparten una sola bolsa de horas y una sola
                    facturación.
                  </p>
                  {(finishedProjects?.items ?? []).length === 0 ? (
                    <p className={styles.hint}>Este cliente todavía no tiene proyectos de desarrollo terminados.</p>
                  ) : (
                    <div className={styles.teamsGrid}>
                      {(finishedProjects?.items ?? []).map((project) => {
                        const checked = developmentProjectIds.includes(project.id);
                        return (
                          <label key={project.id} className={styles.teamCheckbox}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setDevelopmentProjectIds((prev) =>
                                  checked ? prev.filter((id) => id !== project.id) : [...prev, project.id],
                                )
                              }
                            />
                            {project.name} <span className={styles.finishedProjectStatus}>— Finalizado</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Section>
              )}

              {isSupport && (
                <Section title="Contacto del proyecto">
                  <div className={styles.row}>
                    {clientDetail && <ClientDetailCard client={clientDetail} />}

                    <div>
                      <label className={styles.checkboxLine}>
                        <input
                          type="checkbox"
                          checked={useClientContact}
                          onChange={(event) => onToggleUseClientContact(event.target.checked)}
                        />
                        Usar datos de contacto del cliente
                      </label>

                      {!useClientContact && (
                        <div className={styles.section} style={{ paddingTop: 'var(--kora-space-3)' }}>
                          <TextField
                            label="Nombre"
                            value={contactName}
                            onChange={(event) => setContactName(event.target.value)}
                          />
                          <TextField
                            label="Cargo"
                            value={contactPosition}
                            onChange={(event) => setContactPosition(event.target.value)}
                          />
                          <TextField
                            label="Teléfono"
                            value={contactPhone}
                            onChange={(event) => setContactPhone(event.target.value)}
                          />
                          <TextField
                            label="Correo electrónico"
                            type="email"
                            value={contactEmail}
                            onChange={(event) => setContactEmail(event.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {isSupport && (
                <Section title="Tiempos de respuesta (SLA)">
                  <div className={styles.row3}>
                    <Select
                      label="Crítica"
                      options={SUPPORT_SLA_HOUR_OPTIONS}
                      placeholder="—"
                      {...register('supportTargetHoursCritical', { setValueAs: emptyToUndefined })}
                    />
                    <Select
                      label="Alta"
                      options={SUPPORT_SLA_HOUR_OPTIONS}
                      placeholder="—"
                      {...register('supportTargetHoursHigh', { setValueAs: emptyToUndefined })}
                    />
                    <Select
                      label="Media"
                      options={SUPPORT_SLA_HOUR_OPTIONS}
                      placeholder="—"
                      {...register('supportTargetHoursMedium', { setValueAs: emptyToUndefined })}
                    />
                    <Select
                      label="Baja"
                      options={SUPPORT_SLA_HOUR_OPTIONS}
                      placeholder="—"
                      {...register('supportTargetHoursLow', { setValueAs: emptyToUndefined })}
                    />
                  </div>
                </Section>
              )}

              <Section title="Documentación del proyecto">
                <div className={styles.row}>
                  <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
                  <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
                  <TextField label="Adicionales" placeholder="Agregar un link" {...register('additionalLinks')} />
                </div>
              </Section>

              {type === 'development' && (
                <Section title="Estimación del Proyecto">
                  <div className={styles.row}>
                    <TextField
                      label="Fecha de inicio"
                      type="date"
                      disabled={isProspecto}
                      {...register('startDate', { setValueAs: emptyToUndefined })}
                    />
                    <TextField
                      label="Fecha de fin"
                      type="date"
                      disabled={isProspecto}
                      {...register('estimatedDeliveryDate', { setValueAs: emptyToUndefined })}
                    />
                    <TextField label="Horas" type="number" disabled={isProspecto} {...register('soldHours')} />
                  </div>
                </Section>
              )}

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

              {consolidateError && (
                <div className={styles.alert} role="alert">
                  <AlertIcon size={18} className={styles.alertIcon} />
                  <span>{consolidateError}</span>
                </div>
              )}

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(0)}>
                  Atrás
                </Button>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" disabled={hoursExceeded} onClick={() => void goToStep3()}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 2 && isSupport && (
            <>
              <Section title="Duración del servicio">
                <div className={styles.row}>
                  <TextField
                    label="Fecha de inicio"
                    type="date"
                    {...register('startDate', {
                      setValueAs: emptyToUndefined,
                      onChange: (event: ChangeEvent<HTMLInputElement>) => {
                        if (isSupportMonthly && supportSurplusPolicy === 'expire' && !dueDayTouched && event.target.value) {
                          setValue('supportDueDayOfMonth', dayOfIsoDate(event.target.value));
                        }
                      },
                    })}
                  />
                  <TextField
                    label="Fecha de término"
                    type="date"
                    {...register('estimatedDeliveryDate', { setValueAs: emptyToUndefined })}
                  />
                </div>
              </Section>

              <Section title="Tipo de soporte">
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Tipo de soporte<span className={styles.required}>*</span>
                  </span>
                  <SegmentedControl
                    aria-label="Tipo de soporte"
                    options={SUPPORT_PLAN_TYPE_SEGMENTED_OPTIONS}
                    value={supportPlanType ?? ''}
                    onChange={(value) => setValue('supportPlanType', value as SupportPlanType, { shouldValidate: true })}
                  />
                  {errors.supportPlanType && <p className={styles.fieldError}>{errors.supportPlanType.message}</p>}
                </div>

                {isSupportMonthly && (
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Política de excedente</span>
                    <SegmentedControl
                      aria-label="Política de excedente"
                      options={SUPPORT_SURPLUS_POLICY_OPTIONS}
                      value={supportSurplusPolicy ?? ''}
                      onChange={onSupportSurplusPolicyChange}
                    />
                  </div>
                )}

                {isSupportBundleOrMonthly && (
                  <div className={styles.row}>
                    <TextField
                      label={supportPlanType === 'bundle' ? 'Cantidad de HH de la bolsa' : 'Cantidad de HH mensuales'}
                      type="number"
                      min={0}
                      {...register('supportHours')}
                    />
                  </div>
                )}
                <div className={styles.row}>
                  <MoneyField
                    label="Valor de la hora"
                    currency={supportCurrency}
                    onCurrencyChange={(value) => setValue('supportCurrency', value as SupportPlanCurrency)}
                    currencyOptions={SUPPORT_CURRENCY_OPTIONS}
                    step="0.01"
                    min={0}
                    {...register('supportPlanValueUf')}
                  />
                  {isSupportBundleOrMonthly && (
                    <MoneyField
                      label="Valor de horas extra"
                      currency={supportCurrency}
                      onCurrencyChange={(value) => setValue('supportCurrency', value as SupportPlanCurrency)}
                      currencyOptions={SUPPORT_CURRENCY_OPTIONS}
                      step="0.01"
                      min={0}
                      {...register('supportExtraHourValueUf')}
                    />
                  )}
                  {showSupportDueDay && (
                    <Select
                      label="Vencimiento del cupo (día del mes)"
                      options={SUPPORT_DUE_DAY_OPTIONS}
                      value={supportDueDayOfMonth != null ? String(supportDueDayOfMonth) : ''}
                      onChange={(event) => {
                        setDueDayTouched(true);
                        setValue('supportDueDayOfMonth', emptyToUndefined(event.target.value));
                      }}
                    />
                  )}
                </div>
                {showSupportDueDay && (
                  <p className={styles.hint}>
                    Las HH no usadas vencen este día de cada mes — no pasan al mes siguiente. Se sugiere el mismo día de la fecha de
                    inicio.
                  </p>
                )}
              </Section>

              {consolidateError && (
                <div className={styles.alert} role="alert">
                  <AlertIcon size={18} className={styles.alertIcon} />
                  <span>{consolidateError}</span>
                </div>
              )}

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void goToResumenFromSupportConfig()}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 2 && !isSupport && (
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

          {step === 3 && isSupport && (
            <>
              <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                  <h3 className={styles.summaryCardTitle}>Datos del cliente</h3>
                  <SummaryItem label="Empresa" value={clientDetail?.companyName} />
                  <SummaryItem label="Rut" value={clientDetail?.taxId} />
                  <SummaryItem label="Estado" value={clientDetail ? CLIENT_STATUS_LABELS[clientDetail.status] : undefined} />
                  <SummaryItem label="País" value={clientDetail?.country?.name} />
                  <SummaryItem label="Contacto de la empresa" value={clientDetail?.primaryContactName} />
                  <SummaryItem label="Teléfono" value={clientDetail?.primaryContactPhone} />
                  <SummaryItem label="Correo electrónico" value={clientDetail?.primaryContactEmail} />
                </div>

                <div className={styles.summaryCard}>
                  <h3 className={styles.summaryCardTitle}>Datos del proyecto</h3>
                  <SummaryItem label={isConsolidating ? 'Nombre del contrato' : 'Nombre del proyecto'} value={watch('name')} />
                  <SummaryItem label="Líder Kabeli a cargo" value={leaderLabel} />
                  <SummaryItem
                    label="Proyectos incluidos"
                    value={
                      (finishedProjects?.items ?? [])
                        .filter((p) => developmentProjectIds.includes(p.id))
                        .map((p) => p.name)
                        .join(', ') || undefined
                    }
                  />
                  <SummaryItem label="Contacto del proyecto" value={contactLabel} />
                  <SummaryItem
                    label="Teléfono"
                    value={(useClientContact ? clientDetail?.primaryContactPhone : contactPhone) || undefined}
                  />
                  <SummaryItem
                    label="Correo electrónico"
                    value={(useClientContact ? clientDetail?.primaryContactEmail : contactEmail) || undefined}
                  />
                  <SummaryItem label="Cotización" value={quotationLink} />
                  <SummaryItem label="Contrato" value={contractLink} />
                  <SummaryItem label="Adicionales" value={additionalLinks} />
                </div>

                <div className={styles.summaryCard}>
                  <h3 className={styles.summaryCardTitle}>Descripción del contrato de soporte</h3>
                  <SummaryItem label="Tipo" value={supportPlanType ? SUPPORT_PLAN_TYPE_LABELS[supportPlanType] : undefined} />
                  {isSupportMonthly && (
                    <SummaryItem
                      label="Política de excedente"
                      value={supportSurplusPolicy ? SUPPORT_SURPLUS_POLICY_LABELS[supportSurplusPolicy] : undefined}
                    />
                  )}
                  <SummaryItem label="Fecha de inicio" value={startDate} />
                  <SummaryItem label="Fecha de término" value={estimatedDeliveryDate} />
                  {isSupportBundleOrMonthly && (
                    <SummaryItem
                      label={supportPlanType === 'bundle' ? 'HH de la bolsa' : 'HH mensuales'}
                      value={supportHours != null ? `${supportHours} h` : undefined}
                    />
                  )}
                  <SummaryItem
                    label="Valor hora pactado"
                    value={supportPlanValueUf != null ? formatMoney(Number(supportPlanValueUf), supportCurrency) : undefined}
                  />
                  {isSupportBundleOrMonthly && (
                    <SummaryItem
                      label="Valor hora extra"
                      value={supportExtraHourValueUf != null ? formatMoney(Number(supportExtraHourValueUf), supportCurrency) : undefined}
                    />
                  )}
                </div>
              </div>

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button type="submit" loading={isSubmitting} loadingText="Creando…">
                  {isConsolidating ? 'Confirmar y crear contrato' : 'Guardar y Crear Proyecto'}
                </Button>
              </div>
            </>
          )}

          {step === 3 && !isSupport && (
            <>
              <Section title="Datos Proyecto">
                <div className={styles.summaryGrid}>
                  <SummaryItem label="Nombre del proyecto" value={watch('name')} />
                  <SummaryItem label="Tipo" value={salesStage ? PROJECT_SALES_STAGE_LABELS[salesStage] : PROJECT_TYPE_LABELS[type]} />
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
                  {isConsolidating ? 'Confirmar y crear contrato' : 'Guardar y Crear Proyecto'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>

      <ClientFormDialog
        open={clientDialogOpen}
        clientId={null}
        onClose={() => setClientDialogOpen(false)}
        onSuccess={(message) => toast.success(message)}
        onCreated={(client) => setValue('clientId', client.id, { shouldValidate: true })}
      />
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
