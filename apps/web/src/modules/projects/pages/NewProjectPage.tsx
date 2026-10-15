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
  type ProjectSalesStage,
  type ProjectType,
  type SupportPlanCurrency,
  type SupportPlanType,
  type SupportSurplusPolicy,
  type UpdateProjectInput,
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
import { AlertIcon, ChevronLeftIcon, CloseIcon, InfoIcon, PlusIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import {
  useAddProjectModuleDelivery,
  useChangeProjectStatus,
  useCorrectProjectHito0Date,
  useCreateProject,
  useCreateProjectModule,
  useCreateProjectModuleSegment,
  useProjectsList,
  useUpdateProject,
} from '../api/projects.queries';
import { useCreateSupportPlan, useCreateSupportProject } from '../api/support-plan.queries';
import { useClientsList, useClientDetail, useUpdateClient } from '@/modules/clients/api/clients.queries';
import { clientsApi } from '@/modules/clients/api/clients.api';
import { ClientFormDialog } from '@/modules/clients/components/ClientFormDialog';
import {
  PaymentPlanEditor,
  defaultPaymentPlan,
  paymentPlanPayload,
  validatePaymentPlan,
  type PaymentPlanDraft,
} from '../components/PaymentPlanEditor';
import { DeliveryModal, EMPTY_DELIVERY_MODAL_VALUES, type DeliveryModalValues } from '../components/DeliveryModal';
import deliveryModalStyles from '../components/DeliveryModal.module.css';
import { SUPPORT_SLA_TARGET_HOURS, SupportSlaNote } from '../components/SupportSlaNote';
import {
  ExecutionSegmentModal,
  EMPTY_EXECUTION_SEGMENT_MODAL_VALUES,
  formatSegmentMembers,
  toSegmentInput,
  type ExecutionSegmentModalValues,
} from '../components/ExecutionSegmentModal';
import { useUsersList } from '@/modules/users/api/users.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { formatMoney } from '@/shared/lib/format-money';
import { paymentTriggerLabel } from '../lib/payment-milestone-display';
import { projectPath, supportPlanPath } from '@/app/router/paths';

type ProjectFormValues = z.input<typeof createProjectSchema>;

const TYPE_OPTIONS = PROJECT_TYPES.map((type) => ({ value: type, label: PROJECT_TYPE_LABELS[type] }));
const SALES_STAGE_OPTIONS = PROJECT_SALES_STAGES.map((stage) => ({
  value: stage,
  label: PROJECT_SALES_STAGE_LABELS[stage],
}));
const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
/**
 * Opciones de "Estado" al crear — dependen de la etapa comercial, mismo criterio que
 * `estadosDisponibles()` del prototipo de referencia (KORA · Definiciones de tipos, estados,
 * activación y horas de proyecto): Aprobado habilita los 3 estados operativos; antes de Aprobado
 * solo "—" (sin estado) o Detenido. El placeholder del Select es "No iniciado" en Aprobado y "—"
 * antes (valor vacío → sin `status`, y el backend asigna `draft` por defecto a todo proyecto de desarrollo).
 */
const STATUS_PLACEHOLDER_APPROVED = PROJECT_STATUS_LABELS.draft;
const STATUS_PLACEHOLDER_NOT_APPROVED = '—';
const STATUS_OPTIONS_APPROVED = [
  { value: 'active', label: 'Activo (activación manual)' },
  { value: 'on_hold', label: PROJECT_STATUS_LABELS.on_hold },
];
const STATUS_OPTIONS_NOT_APPROVED = [{ value: 'on_hold', label: PROJECT_STATUS_LABELS.on_hold }];

/** Soporte no cambia: "Configuración de soporte" en el mismo índice donde Desarrollo tenía "Fases · Módulos". */
const STEPS_SUPPORT = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
  { label: 'Configuración de soporte' },
  { label: 'Resumen y confirmación' },
];
/**
 * Desarrollo gana un paso propio de Estimación y "Equipos y fases" pasa a ser opcional y a
 * desaparecer del stepper (no solo deshabilitarse) mientras el proyecto no esté Aprobado — mismo
 * criterio que `steps()` del prototipo de referencia.
 */
const STEPS_DEVELOPMENT_APPROVED = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
  { label: 'Estimación' },
  { label: 'Equipos y fases' },
  { label: 'Resumen y confirmación' },
];
const STEPS_DEVELOPMENT_OTHER = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
  { label: 'Estimación' },
  { label: 'Resumen y confirmación' },
];
/** En Prospecto la estimación y el plan de pago aún no se completan — el paso desaparece y se va directo a Resumen. */
const STEPS_DEVELOPMENT_PROSPECT = [
  { label: 'Datos del cliente' },
  { label: 'Datos del proyecto' },
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
/** SLA fijo de los contratos de soporte: se muestra como nota (`SupportSlaNote`) y se envía siempre con estos valores. */
const SUPPORT_SLA_VALUES = {
  supportTargetHoursCritical: SUPPORT_SLA_TARGET_HOURS.critical,
  supportTargetHoursHigh: SUPPORT_SLA_TARGET_HOURS.high,
  supportTargetHoursMedium: SUPPORT_SLA_TARGET_HOURS.medium,
  supportTargetHoursLow: SUPPORT_SLA_TARGET_HOURS.low,
};
const SUPPORT_DUE_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/** Respaldo de un Hito 0 manual (sin factura) — solo copy/UI, se concatena al motivo al enviar (ver `onSubmit`). */
const HITO0_RESPALDO_OPTIONS = ['Contrato firmado', 'Orden de compra', 'Otro'];

function dayOfIsoDate(isoDate: string): number {
  const [, month, day] = isoDate.split('-');
  return Number(day ?? month ?? 1);
}

/** `2026-05-08` → `08-05-2026` — mismo formato que el resto de la ficha de proyecto. */
function formatDeliveryDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

interface DeliveryDraft {
  localId: number;
  name: string;
  teamId: string;
  estimatedDate: string;
  description: string;
}
interface SegmentDraft extends ExecutionSegmentModalValues {
  localId: number;
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
  segments: SegmentDraft[];
}

const EMPTY_MODULE_DRAFT: Omit<ModuleDraft, 'localId'> = {
  name: '',
  initialStage: 'discovery',
  estimatedHours: '',
  estimatedStartDate: '',
  estimatedEndDate: '',
  deliveries: [],
  segments: [],
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
  const updateProject = useUpdateProject();
  const changeStatus = useChangeProjectStatus();
  const correctHito0Date = useCorrectProjectHito0Date();
  const updateClient = useUpdateClient();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId') ?? '';
  const [step, setStep] = useState(preselectedClientId ? 1 : 0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [dueDayTouched, setDueDayTouched] = useState(false);
  // Plan de pago (solo desarrollo) — fuera del formulario, igual que `moduleDrafts`: es una lista con su propio editor.
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanDraft>(defaultPaymentPlan);
  const [paymentPlanError, setPaymentPlanError] = useState<string | null>(null);

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

  /**
   * Estado extra condicional al crear (Desarrollo) — `createProjectSchema` no acepta estos campos
   * (sí `updateProjectSchema`/`changeProjectStatusSchema`), así que viven en `useState` local y se
   * mandan como llamados de seguimiento tras `createProject` (ver `onSubmit`), mismo patrón que ya
   * usa el wizard para Fases · Módulos.
   */
  const [motivoDetenido, setMotivoDetenido] = useState('');
  const [stopReloj, setStopReloj] = useState(false);
  const [fechaActivacion, setFechaActivacion] = useState('');
  const [respaldoActivacion, setRespaldoActivacion] = useState(HITO0_RESPALDO_OPTIONS[0]!);
  const [motivoActivacion, setMotivoActivacion] = useState('');
  const [estadoExtraErrors, setEstadoExtraErrors] = useState<Record<string, string>>({});

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
  const commercialManagerUserId = watch('commercialManagerUserId');
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
  const { data: commercialUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', isCommercialManager: true });
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

  // "Etapa" exige Estado = Activo; "Equipos y fases" (su propio paso) exige Aprobado — igual que v1.
  const isApproved = salesStage === 'approved';
  const isProspecto = salesStage === 'prospect';
  const phaseEnabled = isApproved && status === 'active';
  const equiposEnabled = type === 'development' && isApproved;
  /** Opciones de "Estado" al crear — ver `STATUS_OPTIONS_APPROVED`/`STATUS_OPTIONS_NOT_APPROVED`. */
  const statusOptions = isApproved ? STATUS_OPTIONS_APPROVED : STATUS_OPTIONS_NOT_APPROVED;
  const statusPlaceholder = isApproved ? STATUS_PLACEHOLDER_APPROVED : STATUS_PLACEHOLDER_NOT_APPROVED;

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

  // Desarrollo: "Equipos y fases" (paso 3) solo existe en la lista cuando el proyecto está
  // Aprobado y "Estimación" (paso 2) no existe en Prospecto — no se deshabilitan, desaparecen del
  // stepper (ver STEPS_DEVELOPMENT_APPROVED/_OTHER/_PROSPECT).
  const developmentSteps = isApproved
    ? STEPS_DEVELOPMENT_APPROVED
    : isProspecto
      ? STEPS_DEVELOPMENT_PROSPECT
      : STEPS_DEVELOPMENT_OTHER;
  const hasEstimacionStep = !isSupport && !isProspecto;
  const stepperSteps = isSupport ? STEPS_SUPPORT : developmentSteps;
  const estimacionStepIndex = 2;
  const equiposStepIndex = 3;
  const resumenStepIndex = isSupport ? 3 : developmentSteps.length - 1;

  /**
   * Al cambiar la etapa comercial, si el Estado actual deja de ser una opción válida para la nueva
   * etapa, lo resetea — mismo criterio que `onTipoChange()` del prototipo de referencia. También
   * recorta el paso actual si quedó apuntando a "Equipos y fases" y ese paso dejó de existir.
   */
  const onSalesStageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSalesStage = event.target.value as ProjectSalesStage;
    register('salesStage').onChange(event);
    const nextIsApproved = nextSalesStage === 'approved';
    const validStatuses = new Set((nextIsApproved ? STATUS_OPTIONS_APPROVED : STATUS_OPTIONS_NOT_APPROVED).map((o) => o.value));
    if (status && !validStatuses.has(status)) {
      setValue('status', undefined);
      setEstadoExtraErrors({});
    }
    if (!nextIsApproved && step === equiposStepIndex) setStep(estimacionStepIndex);
  };

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
  const createSegment = useCreateProjectModuleSegment();
  const [moduleDrafts, setModuleDrafts] = useState<ModuleDraft[]>([]);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const nextModuleLocalId = useRef(1);
  const nextDeliveryLocalId = useRef(1);
  const nextSegmentLocalId = useRef(1);

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

  const removeDeliveryDraft = (moduleLocalId: number, deliveryLocalId: number) => {
    setModuleDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === moduleLocalId
          ? { ...draft, deliveries: draft.deliveries.filter((delivery) => delivery.localId !== deliveryLocalId) }
          : draft,
      ),
    );
  };

  const removeSegmentDraft = (moduleLocalId: number, segmentLocalId: number) => {
    setModuleDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === moduleLocalId
          ? { ...draft, segments: draft.segments.filter((segment) => segment.localId !== segmentLocalId) }
          : draft,
      ),
    );
  };

  // Modal "Nueva entrega" / "Editar entrega" — un solo modal reusado por todas las fases del wizard
  // (ver `DeliveryModal`); `deliveryLocalId: null` significa que se está creando una entrega nueva.
  const [deliveryModal, setDeliveryModal] = useState<{ moduleLocalId: number; deliveryLocalId: number | null } | null>(null);

  const deliveryModalInitialValues: DeliveryModalValues = (() => {
    if (!deliveryModal) return EMPTY_DELIVERY_MODAL_VALUES;
    const draft = moduleDrafts.find((m) => m.localId === deliveryModal.moduleLocalId);
    const delivery = draft?.deliveries.find((d) => d.localId === deliveryModal.deliveryLocalId);
    return delivery
      ? { teamId: delivery.teamId, name: delivery.name, description: delivery.description, estimatedDate: delivery.estimatedDate }
      : EMPTY_DELIVERY_MODAL_VALUES;
  })();

  const onConfirmDeliveryModal = (values: DeliveryModalValues) => {
    if (!deliveryModal) return;
    const { moduleLocalId, deliveryLocalId } = deliveryModal;
    setModuleDrafts((prev) =>
      prev.map((draft) => {
        if (draft.localId !== moduleLocalId) return draft;
        if (deliveryLocalId === null) {
          return { ...draft, deliveries: [...draft.deliveries, { ...values, localId: nextDeliveryLocalId.current++ }] };
        }
        return {
          ...draft,
          deliveries: draft.deliveries.map((delivery) =>
            delivery.localId === deliveryLocalId ? { ...values, localId: delivery.localId } : delivery,
          ),
        };
      }),
    );
    setDeliveryModal(null);
  };

  // Modal "Nuevo tiempo de ejecución" / "Editar tiempo de ejecución" — mismo criterio que `deliveryModal`.
  const [segmentModal, setSegmentModal] = useState<{ moduleLocalId: number; segmentLocalId: number | null } | null>(null);

  const segmentModalInitialValues: ExecutionSegmentModalValues = (() => {
    if (!segmentModal) return EMPTY_EXECUTION_SEGMENT_MODAL_VALUES;
    const draft = moduleDrafts.find((m) => m.localId === segmentModal.moduleLocalId);
    const segment = draft?.segments.find((s) => s.localId === segmentModal.segmentLocalId);
    return segment ?? EMPTY_EXECUTION_SEGMENT_MODAL_VALUES;
  })();

  const onConfirmSegmentModal = (values: ExecutionSegmentModalValues) => {
    if (!segmentModal) return;
    const { moduleLocalId, segmentLocalId } = segmentModal;
    setModuleDrafts((prev) =>
      prev.map((draft) => {
        if (draft.localId !== moduleLocalId) return draft;
        if (segmentLocalId === null) {
          return { ...draft, segments: [...draft.segments, { ...values, localId: nextSegmentLocalId.current++ }] };
        }
        return {
          ...draft,
          segments: draft.segments.map((segment) =>
            segment.localId === segmentLocalId ? { ...values, localId: segment.localId } : segment,
          ),
        };
      }),
    );
    setSegmentModal(null);
  };

  const goToStep2 = () => setStep(1);

  /** Deja "Datos del proyecto" — valida los campos del formulario más los del estado extra local (motivo Detenido / Hito 0 manual), ninguno de los dos vive en `createProjectSchema`. */
  const goToEstimacion = async () => {
    const fields: Array<keyof ProjectFormValues> = ['name', 'type'];
    if (type === 'development') fields.push('salesStage', 'leaderUserId', 'commercialManagerUserId');
    const valid = await trigger(fields);
    const extraErrors: Record<string, string> = {};
    if (status === 'on_hold' && !motivoDetenido.trim()) {
      extraErrors.motivoDetenido = 'El motivo es obligatorio mientras el proyecto esté Detenido.';
    }
    if (status === 'active') {
      if (!fechaActivacion) extraErrors.fechaActivacion = 'Indica la fecha del Hito 0.';
      if (!motivoActivacion.trim()) extraErrors.motivoActivacion = 'Indica el motivo o la referencia del respaldo.';
    }
    setEstadoExtraErrors(extraErrors);
    if (!valid || Object.keys(extraErrors).length > 0) return;
    // En Prospecto no hay paso de Estimación: el índice 2 ya es Resumen.
    setStep(2);
  };

  /** Deja "Estimación" (no existe en Prospecto) — sin equipos/fases (Cotización, o el usuario eligió omitirlo) va directo a Resumen. */
  /** El plan de pago vive en Estimación: se valida al dejar ese paso. */
  const paymentPlanIsValid = () => {
    const error = validatePaymentPlan(paymentPlan);
    setPaymentPlanError(error);
    return error === null;
  };

  const goToEquiposOrResumen = () => {
    if (!paymentPlanIsValid()) return;
    setStep(isApproved ? equiposStepIndex : resumenStepIndex);
  };

  /** Botón "Crear proyecto" de Estimación (solo Aprobado) — salta Equipos·Fases directo a Resumen, quedan vacíos/pendientes para el líder. */
  const goToResumenSkippingEquipos = () => {
    if (!paymentPlanIsValid()) return;
    setStep(resumenStepIndex);
  };

  /** Deja "Equipos y fases" — mismas validaciones que antes vivían al dejar "Datos del Proyecto" (horas excedidas) más nombres de módulo. */
  const goToResumen = () => {
    if (hoursExceeded) return;
    if (moduleDrafts.some((draft) => !draft.name.trim())) {
      setModuleError('Ponle un nombre a todos los módulos agregados antes de continuar.');
      return;
    }
    // Las HH de cada fase son la base del avance real del proyecto — obligatorias.
    if (moduleDrafts.some((draft) => !(Number(draft.estimatedHours) > 0))) {
      setModuleError('Indica las horas estimadas (mayores a 0) de todas las fases antes de continuar.');
      return;
    }
    setModuleError(null);
    setStep(resumenStepIndex);
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
            targetHoursCritical: SUPPORT_SLA_TARGET_HOURS.critical,
            targetHoursHigh: SUPPORT_SLA_TARGET_HOURS.high,
            targetHoursMedium: SUPPORT_SLA_TARGET_HOURS.medium,
            targetHoursLow: SUPPORT_SLA_TARGET_HOURS.low,
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

        const result = await createSupportProject.mutateAsync({ ...values, ...SUPPORT_SLA_VALUES, primaryContactId: await resolveProjectContactId() });
        toast.success(`Se creó el proyecto y contrato de soporte de ${values.name}.`);
        // `result.id` es el proyecto (no el contrato) — la ficha de proyecto ya muestra el resumen
        // del plan vía `SupportProjectDetailView` (`useSupportPlanSummary(projectId)`).
        void navigate(projectPath(result));
        return;
      }

      const isManualHito0 = values.type === 'development' && values.salesStage === 'approved' && values.status === 'active';
      // En Prospecto no se manda plan ni estimación: el backend crea el plan por defecto (Inicio/Marcha
      // blanca, montos en 0) y fechas, horas, monto y tramos se completan al pasar a Cotización. Se
      // limpian por si se llenaron con otra etapa comercial antes de volver a Prospecto.
      const developmentValues = isProspecto
        ? { ...values, startDate: undefined, estimatedDeliveryDate: undefined, soldHours: 0 }
        : { ...values, ...paymentPlanPayload(paymentPlan) };
      const result = await createProject.mutateAsync(isManualHito0 ? { ...developmentValues, status: 'draft' } : developmentValues);

      if (values.type === 'development') {
        const primaryContactId = await resolveProjectContactId();
        const followUpUpdate: UpdateProjectInput = {};
        if (primaryContactId) followUpUpdate.primaryContactId = primaryContactId;
        if (values.status === 'on_hold') {
          followUpUpdate.onHoldReason = motivoDetenido.trim();
          if (isApproved) followUpUpdate.stopsClock = stopReloj;
        }
        if (Object.keys(followUpUpdate).length > 0) {
          await updateProject.mutateAsync({ projectId: result.id, input: followUpUpdate });
        }
        if (isManualHito0) {
          await changeStatus.mutateAsync({
            projectId: result.id,
            input: { status: 'active', reason: `${respaldoActivacion}: ${motivoActivacion.trim()}` },
          });
          // La activación deja el Hito 0 en "ahora" — se alinea con la fecha indicada en el formulario.
          await correctHito0Date.mutateAsync({ projectId: result.id, input: { date: fechaActivacion } });
        }
      }

      if (moduleDrafts.length > 0) {
        await Promise.all(
          moduleDrafts
            .filter((draft) => draft.name.trim())
            .map(async (draft) => {
              const input: CreateProjectModuleInput = {
                name: draft.name.trim(),
                initialStage: draft.initialStage,
                estimatedHours: Number(draft.estimatedHours),
                estimatedStartDate: draft.estimatedStartDate || undefined,
                estimatedEndDate: draft.estimatedEndDate || undefined,
              };
              const module = await createModule.mutateAsync({ projectId: result.id, input });
              const pendingDeliveries = draft.deliveries.filter((delivery) => delivery.estimatedDate && delivery.name.trim());
              if (pendingDeliveries.length > 0) {
                await Promise.all(
                  pendingDeliveries.map((delivery) =>
                    addDelivery.mutateAsync({
                      projectId: result.id,
                      moduleId: module.id,
                      input: {
                        name: delivery.name.trim(),
                        description: delivery.description.trim() || undefined,
                        teamId: delivery.teamId || undefined,
                        estimatedDate: delivery.estimatedDate,
                      },
                    }),
                  ),
                );
              }
              const pendingSegments = draft.segments.filter(
                (segment) => segment.teamId && segment.name.trim() && segment.startDate && segment.endDate,
              );
              if (pendingSegments.length > 0) {
                await Promise.all(
                  pendingSegments.map((segment) =>
                    createSegment.mutateAsync({
                      projectId: result.id,
                      moduleId: module.id,
                      input: toSegmentInput(segment),
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
    <DashboardLayout title="Proyectos">
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

      <Stepper steps={stepperSteps} activeIndex={step} />

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
                        <TextField label="Nombre" value={contactName} onChange={(event) => setContactName(event.target.value)} />
                        <TextField label="Cargo" value={contactPosition} onChange={(event) => setContactPosition(event.target.value)} />
                        <TextField label="Teléfono" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
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

              <Section title="Datos del Proyecto">
                <TextField
                  label={isConsolidating ? 'Nombre del contrato' : 'Nombre del proyecto'}
                  required
                  errorText={errors.name?.message}
                  {...register('name')}
                />

                {type === 'development' && (
                  <div className={styles.row}>
                    <Select
                      label="Etapa comercial"
                      required
                      options={SALES_STAGE_OPTIONS}
                      errorText={errors.salesStage?.message}
                      {...register('salesStage')}
                      onChange={onSalesStageChange}
                    />
                    <Select
                      label="Estado"
                      placeholder={statusPlaceholder}
                      options={statusOptions}
                      {...register('status', { setValueAs: emptyToUndefined })}
                      onChange={(event) => {
                        register('status', { setValueAs: emptyToUndefined }).onChange(event);
                        setEstadoExtraErrors({});
                      }}
                    />
                    <Select
                      label="Etapa"
                      placeholder={phaseEnabled ? 'Sin definir' : 'Disponible al aprobar y activo'}
                      disabled={!phaseEnabled}
                      options={PHASE_OPTIONS}
                      {...register('phase', { setValueAs: emptyToUndefined })}
                    />
                  </div>
                )}

                <div className={styles.row}>
                  <Select
                    className={styles.leaderField}
                    label="Líder Kabeli a cargo"
                    placeholder="Sin asignar"
                    required={type === 'development'}
                    errorText={errors.leaderUserId?.message}
                    options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                    {...register('leaderUserId', { setValueAs: emptyToUndefined })}
                  />
                  {type === 'development' && (isProspecto || salesStage === 'quoted') && (
                    <Select
                      label="Responsable comercial"
                      placeholder="Sin asignar"
                      required
                      errorText={errors.commercialManagerUserId?.message}
                      options={(commercialUsers?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
                      {...register('commercialManagerUserId', { setValueAs: emptyToUndefined })}
                    />
                  )}
                </div>
              </Section>

              {type === 'development' && status === 'on_hold' && (
                <div className={`${styles.subCard} ${styles.subCardDetenido}`}>
                  <p className={styles.subCardTitle}>Proyecto detenido</p>
                  <p className={styles.subCardSub}>
                    Proyecto que está en pausa (por el cliente u otro motivo). Disponible desde Prospecto hasta antes de
                    Finalizado.
                  </p>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Motivo del detenimiento<span className={styles.required}>*</span>
                    </span>
                    <textarea
                      className={[styles.textarea, estadoExtraErrors.motivoDetenido ? styles.textareaError : ''].filter(Boolean).join(' ')}
                      placeholder="Ej. Cliente en pausa de presupuesto, a la espera de definición de alcance…"
                      value={motivoDetenido}
                      onChange={(event) => setMotivoDetenido(event.target.value)}
                    />
                    {estadoExtraErrors.motivoDetenido && <p className={styles.fieldError}>{estadoExtraErrors.motivoDetenido}</p>}
                  </div>
                  {isApproved && (
                    <label className={styles.checkboxLine}>
                      <input type="checkbox" checked={stopReloj} onChange={(event) => setStopReloj(event.target.checked)} />
                      Detener el reloj del proyecto (Stop de reloj)
                    </label>
                  )}
                </div>
              )}

              {type === 'development' && status === 'active' && isApproved && (
                <div className={`${styles.subCard} ${styles.subCardActivo}`}>
                  <p className={styles.subCardTitle}>Activación manual · Hito 0 (kickoff)</p>
                  <p className={styles.subCardSub}>
                    Lo normal es que el proyecto se active solo al marcar la primera factura como facturada. Usa esta
                    opción cuando hay un respaldo sin factura, por ejemplo un contrato firmado o una orden de compra.
                  </p>
                  <div className={styles.row}>
                    <TextField
                      label="Fecha del Hito 0"
                      type="date"
                      required
                      value={fechaActivacion}
                      onChange={(event) => setFechaActivacion(event.target.value)}
                      errorText={estadoExtraErrors.fechaActivacion}
                    />
                    <Select
                      label="Respaldo"
                      options={HITO0_RESPALDO_OPTIONS.map((option) => ({ value: option, label: option }))}
                      value={respaldoActivacion}
                      onChange={(event) => setRespaldoActivacion(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Motivo o referencia<span className={styles.required}>*</span>
                    </span>
                    <textarea
                      className={[styles.textarea, estadoExtraErrors.motivoActivacion ? styles.textareaError : ''].filter(Boolean).join(' ')}
                      placeholder="Ej. Contrato firmado el 12/10, OC N° 4521…"
                      value={motivoActivacion}
                      onChange={(event) => setMotivoActivacion(event.target.value)}
                    />
                    {estadoExtraErrors.motivoActivacion && <p className={styles.fieldError}>{estadoExtraErrors.motivoActivacion}</p>}
                  </div>
                  <p className={styles.hint}>
                    Queda registrado en la bitácora quién activó el proyecto, cuándo y por qué. Cuando llegue la primera
                    factura, se asocia a este Hito 0 sin cambiar el estado.
                  </p>
                </div>
              )}

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
                <Section title="Tiempos de respuesta (SLA)">
                  <SupportSlaNote />
                </Section>
              )}

              <Section title="Documentación del proyecto">
                <div className={styles.row}>
                  <TextField label="Cotización" placeholder="Agregar un link" {...register('quotationLink')} />
                  <TextField label="Contrato" placeholder="Agregar un link" {...register('contractLink')} />
                  <TextField label="Adicionales" placeholder="Agregar un link" {...register('additionalLinks')} />
                </div>
              </Section>

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
                <Button type="button" onClick={() => void goToEstimacion()}>
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === estimacionStepIndex && hasEstimacionStep && (
            <>
              <Section title="Estimación del Proyecto">
                {salesStage === 'quoted' && (
                  <div className={styles.infoBox}>
                    <InfoIcon size={16} />
                    <div>
                      Fechas y horas estimadas con las que se arma la cotización. Cuando el proyecto pase a Aprobado, las
                      horas estimadas quedan como horas vendidas.
                    </div>
                  </div>
                )}
                <div className={styles.row}>
                  <TextField label="Fecha de inicio" type="date" {...register('startDate', { setValueAs: emptyToUndefined })} />
                  <TextField
                    label="Fecha de fin"
                    type="date"
                    {...register('estimatedDeliveryDate', { setValueAs: emptyToUndefined })}
                  />
                  <TextField label={isApproved ? 'Horas vendidas' : 'Horas estimadas'} type="number" {...register('soldHours')} />
                </div>
              </Section>

              <Section title="Plan de pago">
                <p className={styles.hint}>
                  Tramos en que se cobra el proyecto. Cada tramo queda <b>Por facturar</b> cuando se cumple su hito y se
                  avisa por correo a Finanzas y Gerencia.
                </p>
                <PaymentPlanEditor
                  value={paymentPlan}
                  onChange={(next) => {
                    setPaymentPlan(next);
                    setPaymentPlanError(null);
                  }}
                />
                {paymentPlanError && (
                  <div className={styles.alert} role="alert">
                    <AlertIcon size={18} className={styles.alertIcon} />
                    <span>{paymentPlanError}</span>
                  </div>
                )}
              </Section>

              <Section title="Registro de horas">
                <div className={styles.warnBox}>
                  <InfoIcon size={16} />
                  <div>
                    Desde que se crea el proyecto, los colaboradores pueden cargar horas (por ejemplo, maquetas o
                    estimaciones pedidas en Prospecto). Todas las horas registradas antes de la fecha de emisión de la
                    primera factura quedan en la fase <b>Prospecto/Cotización</b>, que suma al proyecto vendido.
                  </div>
                </div>
              </Section>

              {isApproved && (
                <div className={styles.infoBox}>
                  <InfoIcon size={16} />
                  <div>
                    <b>Con fechas, horas vendidas y líder asignado ya puedes crear el proyecto.</b> Equipos y fases son
                    opcionales: si los dejas vacíos, los completa {leaderLabel || 'el líder del proyecto'} cuando entre
                    al proyecto.
                  </div>
                </div>
              )}

              <div className={styles.actionsSplit}>
                <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                  Cancelar
                </Button>
                <div className={styles.actionsRight}>
                  <Button variant="outline" type="button" onClick={() => setStep(1)}>
                    Volver atrás
                  </Button>
                  {isApproved ? (
                    <>
                      <Button variant="outline" type="button" onClick={goToResumenSkippingEquipos}>
                        Crear proyecto
                      </Button>
                      <Button type="button" onClick={goToEquiposOrResumen}>
                        Continuar con equipos y fases
                      </Button>
                    </>
                  ) : (
                    <Button type="button" onClick={goToEquiposOrResumen}>
                      Continuar
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {step === equiposStepIndex && !isSupport && isApproved && (
            <>
              <div className={styles.infoBox}>
                <InfoIcon size={16} />
                <div>
                  <b>Paso opcional.</b> Puedes crear el proyecto sin completar esta sección: {leaderLabel || 'el líder'}{' '}
                  la verá pendiente al entrar al proyecto y podrá completarla.
                </div>
              </div>

              <Card>
                <div className={styles.form}>
                  <Section title="Equipos e involucrados">
                    <p className={styles.hint} style={{ marginTop: 0 }}>
                      Sin fechas propias: trabajan a lo largo de todo el proyecto. Las horas asignadas se descuentan de
                      las horas disponibles.
                    </p>

                    <div className={styles.hoursPanel}>
                      <div className={styles.hoursCell}>
                        <div className={styles.hoursCellLabel}>Horas vendidas</div>
                        <div className={styles.hoursCellValue}>{Number(soldHours) || 0} hh</div>
                        <div className={styles.hoursCellNote}>Ingresadas en Estimación</div>
                      </div>
                      <div className={styles.hoursCell}>
                        <div className={styles.hoursCellLabel}>Fase Prospecto/Cotización</div>
                        <div className={styles.hoursCellValue}>0 hh</div>
                        <div className={styles.hoursCellNote}>Horas registradas antes del Hito 0</div>
                      </div>
                      <div className={styles.hoursCell}>
                        <div className={styles.hoursCellLabel}>Disponibles para distribuir</div>
                        <div className={styles.hoursCellValue}>{Number(soldHours) || 0} hh</div>
                        <div className={styles.hoursCellNote}>Vendidas − Prospecto/Cotización</div>
                      </div>
                      <div className={[styles.hoursCell, hoursExceeded ? styles.hoursCellOver : styles.hoursCellOk].join(' ')}>
                        <div className={styles.hoursCellLabel}>Asignadas a equipos</div>
                        <div className={styles.hoursCellValue}>{totalTeamHours} hh</div>
                        <div className={styles.hoursCellNote}>
                          {hoursExceeded
                            ? `Excede en ${totalTeamHours - (Number(soldHours) || 0)} hh las horas disponibles`
                            : 'Horas por asignar: ' + Math.max((Number(soldHours) || 0) - totalTeamHours, 0)}
                        </div>
                      </div>
                    </div>

                    <div className={styles.teamsLayout}>
                      <div className={styles.teamsAvailable}>
                        <h3 className={styles.teamsSubtitle}>Equipos disponibles</h3>
                        <div className={styles.teamsGrid}>
                          {(teams?.items ?? []).map((team) => {
                            const checked = teamFields.some((field) => field.teamId === team.id);
                            return (
                              <label key={team.id} className={styles.teamCheckbox}>
                                <input type="checkbox" checked={checked} onChange={() => toggleTeam(team.id)} />
                                {team.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {teamFields.length > 0 && (
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
                          La suma de horas estimadas de los equipos ({totalTeamHours} hrs) supera las horas asignadas al
                          proyecto ({Number(soldHours) || 0} hrs). Ajusta las horas antes de continuar.
                        </span>
                      </div>
                    )}
                  </Section>

                  <Section title="Fases · Módulos">
                    <p className={styles.hint} style={{ marginTop: 0 }}>
                      Unidades de entrega del proyecto — cada una recorre las etapas del sistema (Levantamiento →
                      Desarrollo → Producción → Marcha blanca → Finalizado) de forma independiente.
                    </p>

                    <div className={styles.phaseCardLocked}>
                      <div className={styles.phaseCardLockedHead}>
                        <span className={styles.moduleKicker}>Fase 1</span>
                        <span className={styles.finishedProjectStatus}>Automática</span>
                      </div>
                      <div className={styles.row}>
                        <TextField label="Nombre" value="Prospecto/Cotización" disabled readOnly />
                        <TextField label="Horas consumidas" value="0 hh" disabled readOnly />
                      </div>
                      <p className={styles.hint} style={{ marginTop: 0 }}>
                        Se crea sola y no se puede editar ni eliminar. Acumula todas las horas registradas antes de la
                        fecha de emisión de la primera factura; si la factura se sube días después, las horas de esos
                        días se reclasifican a las fases del proyecto.
                      </p>
                    </div>

                    {moduleError && (
                      <div className={styles.alert} role="alert">
                        <AlertIcon size={18} className={styles.alertIcon} />
                        <span>{moduleError}</span>
                      </div>
                    )}

                    {moduleDrafts.length === 0 && <p className={styles.hint}>Aún no hay más fases.</p>}

                    <div className={styles.modulesList}>
                      {moduleDrafts.map((draft, index) => (
                        <div key={draft.localId} className={styles.moduleCard}>
                          <div className={styles.moduleCardHead}>
                            <span className={styles.moduleKicker}>Fase {index + 2}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={styles.iconDanger}
                              onClick={() => removeModuleDraft(draft.localId)}
                              aria-label={`Eliminar fase ${index + 2}`}
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
                              required
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
                            <div className={styles.moduleCardHead}>
                              <span className={styles.moduleDeliveriesLabel}>Tiempos de ejecución por equipo</span>
                              <span className={styles.deliveryHint}>
                                Semanas/días de cada equipo en esta Fase — es lo que dibuja el Roadmap.
                              </span>
                            </div>
                            {draft.segments.length === 0 && <p className={styles.hint}>Aún no hay tiempos de ejecución para esta fase.</p>}
                            {draft.segments.map((segment) => (
                              <div key={segment.localId} className={deliveryModalStyles.listRow}>
                                <div className={deliveryModalStyles.listInfo}>
                                  <span className={deliveryModalStyles.listName}>
                                    {teams?.items.find((team) => team.id === segment.teamId)?.name ?? ''}
                                    {segment.name && <span className={deliveryModalStyles.listNameTeam}> — {segment.name}</span>}
                                  </span>
                                  <span className={deliveryModalStyles.listMeta}>
                                    {formatDeliveryDate(segment.startDate)} → {formatDeliveryDate(segment.endDate)}
                                  </span>
                                  {segment.members.length > 0 && (
                                    <span className={deliveryModalStyles.listMeta}>{formatSegmentMembers(segment.members)}</span>
                                  )}
                                </div>
                                <div className={deliveryModalStyles.listActions}>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={deliveryModalStyles.listEditButton}
                                    onClick={() => setSegmentModal({ moduleLocalId: draft.localId, segmentLocalId: segment.localId })}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={deliveryModalStyles.listDeleteButton}
                                    onClick={() => removeSegmentDraft(draft.localId, segment.localId)}
                                    aria-label={`Quitar tiempo de ejecución "${segment.name}"`}
                                  >
                                    <CloseIcon size={14} />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {teamFields.length === 0 ? (
                              <p className={styles.hint}>
                                Primero asigná equipos en "Equipos e involucrados" para poder agregar tiempos de ejecución.
                              </p>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={deliveryModalStyles.addButton}
                                iconLeft={<PlusIcon size={14} />}
                                onClick={() => setSegmentModal({ moduleLocalId: draft.localId, segmentLocalId: null })}
                              >
                                Agregar tiempo de ejecución
                              </Button>
                            )}
                          </div>

                          <div className={styles.moduleDeliveries}>
                            <span className={styles.moduleDeliveriesLabel}>Entregas estimadas</span>
                            {draft.deliveries.length === 0 && <p className={styles.hint}>Aún no hay entregas para esta fase.</p>}
                            {draft.deliveries.map((delivery) => (
                              <div key={delivery.localId} className={deliveryModalStyles.listRow}>
                                <div className={deliveryModalStyles.listInfo}>
                                  <span className={deliveryModalStyles.listName}>
                                    {delivery.name}
                                    {delivery.teamId && (
                                      <span className={deliveryModalStyles.listNameTeam}>
                                        {' '}
                                        · {teams?.items.find((team) => team.id === delivery.teamId)?.name ?? ''}
                                      </span>
                                    )}
                                  </span>
                                  <span className={deliveryModalStyles.listMeta}>
                                    {formatDeliveryDate(delivery.estimatedDate)}
                                    {delivery.description ? ` · ${delivery.description}` : ''}
                                  </span>
                                </div>
                                <div className={deliveryModalStyles.listActions}>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={deliveryModalStyles.listEditButton}
                                    onClick={() => setDeliveryModal({ moduleLocalId: draft.localId, deliveryLocalId: delivery.localId })}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={deliveryModalStyles.listDeleteButton}
                                    onClick={() => removeDeliveryDraft(draft.localId, delivery.localId)}
                                    aria-label={`Quitar entrega "${delivery.name}"`}
                                  >
                                    <CloseIcon size={14} />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {teamFields.length === 0 ? (
                              <p className={styles.hint}>
                                Primero asigná equipos en "Equipos e involucrados" para poder agregar entregas.
                              </p>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={deliveryModalStyles.addButton}
                                iconLeft={<PlusIcon size={14} />}
                                onClick={() => setDeliveryModal({ moduleLocalId: draft.localId, deliveryLocalId: null })}
                              >
                                Agregar entrega
                              </Button>
                            )}
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
                  </Section>

                  <div className={styles.actions}>
                    <Button variant="outline" type="button" onClick={() => setStep(estimacionStepIndex)}>
                      Atrás
                    </Button>
                    <Button variant="outline" type="button" onClick={() => void navigate('/proyectos')}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={goToResumen}>
                      Continuar
                    </Button>
                  </div>
                </div>
              </Card>
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

          {step === resumenStepIndex && !isSupport && (
            <>
              <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                  <h3 className={styles.summaryCardTitle}>Datos del proyecto</h3>
                  <SummaryItem label="Nombre del proyecto" value={watch('name')} />
                  <SummaryItem label="Etapa comercial" value={salesStage ? PROJECT_SALES_STAGE_LABELS[salesStage] : undefined} />
                  <SummaryItem label="Estado" value={status ? PROJECT_STATUS_LABELS[status] : statusPlaceholder} />
                  <SummaryItem label="Líder" value={leaderLabel} />
                  <SummaryItem
                    label="Responsable comercial"
                    value={commercialUsers?.items.find((u) => u.id === commercialManagerUserId)?.fullName}
                  />
                  <SummaryItem label="Documentación" value={[quotationLink, contractLink, additionalLinks].filter(Boolean).length ? 'Con documentos' : undefined} />
                  {status === 'on_hold' && isApproved && <SummaryItem label="Stop de reloj" value={stopReloj ? 'Sí' : 'No'} />}
                </div>

                {!isProspecto && (
                  <div className={styles.summaryCard}>
                    <h3 className={styles.summaryCardTitle}>Estimación y horas</h3>
                    <SummaryItem label="Fecha de inicio" value={startDate} />
                    <SummaryItem label="Fecha de fin" value={estimatedDeliveryDate} />
                    <SummaryItem label={isApproved ? 'Horas vendidas' : 'Horas estimadas'} value={soldHours ? `${soldHours} hh` : undefined} />
                    {isApproved && <SummaryItem label="Asignadas a equipos" value={`${totalTeamHours} hh`} />}
                  </div>
                )}

                {!isProspecto && (
                  <div className={styles.summaryCard}>
                    <h3 className={styles.summaryCardTitle}>Plan de pago</h3>
                    <SummaryItem
                      label="Monto del contrato"
                      value={paymentPlan.contractAmount ? formatMoney(Number(paymentPlan.contractAmount), paymentPlan.contractCurrency) : undefined}
                    />
                    {paymentPlan.items.map((item) => (
                      <SummaryItem
                        key={item.key}
                        label={item.percent ? `${item.name} (${item.percent}%)` : item.name}
                        value={`${formatMoney(Number(item.amount || 0), paymentPlan.contractCurrency)} · ${paymentTriggerLabel({
                          triggerType: item.triggerType,
                          triggerPhase: item.triggerPhase || null,
                          triggerDate: item.triggerDate || null,
                        })}`}
                      />
                    ))}
                  </div>
                )}

                {clientDetail && (
                  <div className={styles.summaryCard}>
                    <h3 className={styles.summaryCardTitle}>Cliente</h3>
                    <ClientDetailCard client={clientDetail} />
                  </div>
                )}
              </div>

              {isApproved && (
                <div className={styles.summaryCards}>
                  <div className={styles.summaryCard}>
                    <h3 className={styles.summaryCardTitle}>Equipos e involucrados</h3>
                    {teamFields.length > 0 ? (
                      teamFields.map((field) => {
                        const teamName = teams?.items.find((t) => t.id === field.teamId)?.name ?? '—';
                        return <SummaryItem key={field.id} label={teamName} value={field.leaderUserId ? 'Configurado' : 'Incompleto'} />;
                      })
                    ) : (
                      <p className={styles.hint} style={{ margin: 0 }}>
                        Pendiente: lo completa {leaderLabel || 'el líder del proyecto'}.
                      </p>
                    )}
                  </div>
                  <div className={styles.summaryCard}>
                    <h3 className={styles.summaryCardTitle}>Fases · Módulos</h3>
                    <SummaryItem label="Fase 1 · Prospecto/Cotización" value="0 hh" />
                    {moduleDrafts.length > 0 ? (
                      moduleDrafts.map((draft, index) => (
                        <SummaryItem
                          key={draft.localId}
                          label={`Fase ${index + 2} · ${draft.name || 'Sin nombre'}`}
                          value={`${PROJECT_MODULE_STAGE_LABELS[draft.initialStage]}${draft.estimatedHours ? ` · ${draft.estimatedHours} hh` : ''}`}
                        />
                      ))
                    ) : (
                      <p className={styles.hint} style={{ margin: 0 }}>
                        Resto de las fases pendiente: lo completa {leaderLabel || 'el líder del proyecto'}.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.nextBox}>
                <p className={styles.nextBoxTitle}>Qué pasa al crear el proyecto</p>
                <ul className={styles.nextBoxList}>
                  {leaderLabel && (
                    <li>
                      Se notifica a <b>{leaderLabel}</b> que fue asignado como líder. Desde ese momento puede entrar al
                      proyecto y continuar con lo que falte.
                    </li>
                  )}
                  {status === 'on_hold' && <li>El proyecto queda <b>Detenido</b>. Motivo: {motivoDetenido || '—'}.</li>}
                  {!isApproved && status !== 'on_hold' && (
                    <>
                      <li>Los colaboradores ya pueden registrar horas; quedan en la fase Prospecto/Cotización.</li>
                      <li>
                        No se pueden asociar facturas mientras el proyecto no sea Aprobado. Si Finanzas intenta subir
                        una, se bloquea la carga y se notifica a Gerencia y al líder PMO para que actualicen el tipo y
                        completen los datos.
                      </li>
                    </>
                  )}
                  {isApproved && (!status || status === 'draft') && (
                    <>
                      <li>
                        Pasará a <b>Activo</b> automáticamente cuando Finanzas marque la primera factura como
                        facturada. Las horas vendidas corren desde la fecha de emisión de esa factura.
                      </li>
                      <li>Al activarse, se notifica a Gerencia, al líder PMO y a los líderes de equipo.</li>
                      <li>Gerencia o el líder PMO también pueden activarlo manualmente, con motivo o referencia.</li>
                    </>
                  )}
                  {isApproved && status === 'active' && (
                    <li>
                      Queda <b>Activo</b> desde el {fechaActivacion || 'hoy'} (Hito 0 manual · {respaldoActivacion}). Las
                      horas vendidas corren desde esa fecha. Cuando llegue la primera factura, se asocia a este Hito 0
                      sin cambiar el estado.
                    </li>
                  )}
                  {isApproved && status === 'on_hold' && (
                    <li>Si llega la primera factura mientras está Detenido, se pide confirmación para reactivarlo a Activo.</li>
                  )}
                </ul>
              </div>

              <div className={styles.actions}>
                <Button variant="outline" type="button" onClick={() => setStep(isApproved ? equiposStepIndex : isProspecto ? 1 : estimacionStepIndex)}>
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

      <ClientFormDialog
        open={clientDialogOpen}
        clientId={null}
        onClose={() => setClientDialogOpen(false)}
        onSuccess={(message) => toast.success(message)}
        onCreated={(client) => setValue('clientId', client.id, { shouldValidate: true })}
      />

      <DeliveryModal
        open={deliveryModal !== null}
        mode={deliveryModal?.deliveryLocalId === null ? 'create' : 'edit'}
        teamOptions={teamFields.map((field) => ({
          value: field.teamId,
          label: teams?.items.find((team) => team.id === field.teamId)?.name ?? field.teamId,
        }))}
        initialValues={deliveryModalInitialValues}
        onCancel={() => setDeliveryModal(null)}
        onConfirm={onConfirmDeliveryModal}
      />

      <ExecutionSegmentModal
        open={segmentModal !== null}
        mode={segmentModal?.segmentLocalId === null ? 'create' : 'edit'}
        teamOptions={teamFields.map((field) => ({
          value: field.teamId,
          label: teams?.items.find((team) => team.id === field.teamId)?.name ?? field.teamId,
        }))}
        initialValues={segmentModalInitialValues}
        onCancel={() => setSegmentModal(null)}
        onConfirm={onConfirmSegmentModal}
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
