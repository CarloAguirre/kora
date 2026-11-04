import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
  PROJECT_STATUS_LABELS,
  SUPPORT_PLAN_CURRENCIES,
  SUPPORT_PLAN_CURRENCY_LABELS,
  SUPPORT_PLAN_TYPE_LABELS,
  SUPPORT_SURPLUS_POLICIES,
  SUPPORT_SURPLUS_POLICY_LABELS,
  updateProjectSchema,
  type CreateProjectModuleInput,
  type ProjectDetail,
  type ProjectModule,
  type ProjectModuleStage,
  type ProjectModuleDelivery,
  type ProjectModuleSegment,
  type ProjectSalesStage,
  type ProjectStatus,
  type SupportPlanCurrency,
  type SupportPlanType,
  type SupportSurplusPolicy,
  type UpdateProjectInput,
  type UpdateProjectModuleInput,
  type UpdateSupportPlanInput,
} from '@kora/contracts';
import styles from './EditProjectDialog.module.css';
import deliveryModalStyles from './DeliveryModal.module.css';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { MoneyField } from '@/shared/components/ui/MoneyField';
import { Select } from '@/shared/components/ui/Select';
import { Combobox } from '@/shared/components/ui/Combobox';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { AlertIcon, PlusIcon, TrashIcon, CloseIcon } from '@/shared/components/icons/Icons';
import {
  DeliveryModal,
  EMPTY_DELIVERY_MODAL_VALUES,
  draftSegmentKey,
  resolveDraftSegmentId,
  toDeliverySegmentOption,
  type DeliveryModalValues,
} from './DeliveryModal';
import { SupportSlaNote } from './SupportSlaNote';
import {
  ExecutionSegmentModal,
  EMPTY_EXECUTION_SEGMENT_MODAL_VALUES,
  formatSegmentMembers,
  segmentToModalValues,
  toSegmentInput,
  type ExecutionSegmentModalValues,
} from './ExecutionSegmentModal';
import {
  useAddProjectModuleDelivery,
  useChangeProjectStatus,
  useCreateProjectModule,
  useCreateProjectModuleSegment,
  useDeleteProjectModule,
  useDeleteProjectModuleSegment,
  useRemoveProjectModuleDelivery,
  useSetProjectOvertimeAuthorization,
  useUpdateProject,
  useUpdateProjectModule,
  useUpdateProjectModuleDelivery,
  useUpdateProjectModuleSegment,
  useProjectsList,
} from '../api/projects.queries';
import { useSupportPlanDetail, useSupportPlansForClient, useUpdateSupportPlan } from '../api/support-plan.queries';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { assignableOptions } from '@/modules/users/lib/assignable-options';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { formatMoney } from '@/shared/lib/format-money';
import {
  PaymentPlanEditor,
  missingApprovalBillingData,
  paymentPlanFromProject,
  paymentPlanPayload,
  validatePaymentPlan,
  type PaymentPlanDraft,
} from './PaymentPlanEditor';

type ProjectFormValues = z.input<typeof updateProjectSchema>;

const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
const MODULE_STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));
/** Mismo orden que en `NewProjectPage` (Bolsa/Mensual/A demanda). */
const SUPPORT_PLAN_TYPE_OPTIONS = (['bundle', 'monthly', 'on_demand'] as const).map((planType) => ({
  value: planType,
  label: SUPPORT_PLAN_TYPE_LABELS[planType],
}));
const SUPPORT_SURPLUS_POLICY_OPTIONS = SUPPORT_SURPLUS_POLICIES.map((policy) => ({
  value: policy,
  label: SUPPORT_SURPLUS_POLICY_LABELS[policy],
}));
const SUPPORT_CURRENCY_OPTIONS = SUPPORT_PLAN_CURRENCIES.map((currency) => ({ value: currency, label: SUPPORT_PLAN_CURRENCY_LABELS[currency] }));

/** Lo que se edita del contrato de soporte desde la ficha del proyecto. */
interface SupportPlanDraft {
  planType: SupportPlanType;
  surplusPolicy: SupportSurplusPolicy | null;
  contractedHours: number;
  /** Valor de la hora y de la hora extra, como texto del input (para no perder "0," mientras se escribe). En la moneda de `currency`. */
  planValueUf: string;
  extraHourValueUf: string;
  currency: SupportPlanCurrency;
}

/** `2026-05-08` → `08-05-2026` — mismo formato que el resto de la ficha de proyecto. */
function formatDeliveryDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

/** Entrega del módulo nuevo (todavía sin `moduleId`) mientras se arma en el formulario — ver `newModuleDeliveries`. */
interface DeliveryDraft extends DeliveryModalValues {
  localId: number;
}

/**
 * A qué entrega apunta el modal "Nueva entrega" / "Editar entrega": una ya
 * guardada en un módulo existente (`kind: 'existing'`, con mutación inmediata
 * a la API) o una del módulo que todavía se está armando (`kind: 'draft'`,
 * solo en memoria hasta que se cree el módulo). `delivery: null` = alta.
 */
type DeliveryModalTarget =
  | { kind: 'existing'; moduleId: string; delivery: ProjectModuleDelivery | null }
  | { kind: 'draft'; delivery: DeliveryDraft | null };

/** Tramo del módulo nuevo (todavía sin `moduleId`) mientras se arma en el formulario — ver `newModuleSegments`. */
interface SegmentDraft extends ExecutionSegmentModalValues {
  localId: number;
}

/** Mismo criterio que `DeliveryModalTarget`, para el modal "Nuevo tiempo de ejecución" / "Editar tiempo de ejecución". */
type SegmentModalTarget =
  | { kind: 'existing'; moduleId: string; segment: ProjectModuleSegment | null }
  | { kind: 'draft'; segment: SegmentDraft | null };

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

const omitKey = (record: Record<string, string>, key: string): Record<string, string> => {
  const next = { ...record };
  delete next[key];
  return next;
};

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
  { value: 'cotizacion', label: 'Cotización' },
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

/**
 * En edición, Prospecto y Cotización admiten "No iniciado" y "Detenido" sin aprobarse.
 * La creación conserva "No iniciado" como estado inicial. Solo Aprobado puede activarse
 * por Hito 0; Finalizado sigue siendo una opción del selector de Tipo.
 */
const ESTADO_OPTIONS_BY_TIPO: Record<ProjectTipo, ProjectStatus[]> = {
  prospecto: ['draft', 'on_hold'],
  cotizacion: ['draft', 'on_hold'],
  aprobado: ['draft', 'active', 'on_hold'],
  finalizado: ['finished'],
};

/** Estado que toma un proyecto al cambiar de Tipo cuando el que tenía ya no es válido — "No iniciado" también al aprobarse: solo el Hito 0 lo activa. */
const ESTADO_DEFAULT_BY_TIPO: Record<ProjectTipo, ProjectStatus> = {
  prospecto: 'draft',
  cotizacion: 'draft',
  aprobado: 'draft',
  finalizado: 'finished',
};

function estadoLabel(tipo: ProjectTipo, status: ProjectStatus, currentStatus: ProjectStatus, hasHito0: boolean): string {
  if (status === 'active' && tipo === 'aprobado' && currentStatus !== 'active' && !hasHito0) return 'Activo (activación manual)';
  return PROJECT_STATUS_LABELS[status];
}

export interface EditProjectDialogProps {
  open: boolean;
  project: ProjectDetail;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /**
   * Gerencia/PMO (`projects:manage`). Sin él, el propio líder no puede reasignar el proyecto a otro
   * líder (campo bloqueado) — el backend exige lo mismo (`CannotReassignProjectLeaderError`). Pasar a
   * Activo sí lo puede hacer el líder del proyecto: el diálogo solo se abre para él o Gerencia/PMO.
   */
  isManagement: boolean;
}

/**
 * Edición de los datos generales de un proyecto ya creado. El tipo
 * (desarrollo/soporte) no se edita aquí: es inmutable tras la creación. Los
 * equipos asignados sí permiten editar líder/colaboradores/horas (como en la
 * v1) — agregar o quitar equipos sigue siendo un flujo aparte en la ficha
 * (`DevelopmentProjectDetailView`).
 */
export function EditProjectDialog({ open, project, onClose, onSuccess, isManagement }: EditProjectDialogProps) {
  const isDevelopment = project.type === 'development';
  const updateProject = useUpdateProject();
  const changeStatus = useChangeProjectStatus();
  const setOvertimeAuthorization = useSetProjectOvertimeAuthorization();
  const toast = useToast();
  const createModule = useCreateProjectModule();
  const updateModule = useUpdateProjectModule();
  const deleteModule = useDeleteProjectModule();
  const addDelivery = useAddProjectModuleDelivery();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const createSegment = useCreateProjectModuleSegment();
  const updateSegment = useUpdateProjectModuleSegment();
  const deleteSegment = useDeleteProjectModuleSegment();
  const removeDelivery = useRemoveProjectModuleDelivery();
  const [showNewModuleForm, setShowNewModuleForm] = useState(false);
  const [moduleDrafts, setModuleDrafts] = useState<Record<string, ModuleEditDraft>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanDraft>(() => paymentPlanFromProject(project));
  // Solo se manda el plan si se tocó: así guardar otros datos no reescribe los tramos.
  const [paymentPlanDirty, setPaymentPlanDirty] = useState(false);
  const [paymentPlanError, setPaymentPlanError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<ProjectTipo>(() => deriveTipo(project.salesStage, project.status));
  const [estado, setEstado] = useState<ProjectStatus>(project.status);
  const [manualActivationReason, setManualActivationReason] = useState('');
  const [allowsOvertime, setAllowsOvertime] = useState(project.allowsOvertime);
  /** Interno: sin plan de pago ni facturación — solo Gerencia/PMO lo cambia (`CannotChangeProjectInternalFlagError`). */
  const [isInternal, setIsInternal] = useState(project.isInternal);
  /** Se intentó guardar con el aviso de facturación pendiente: el aviso pasa a error y se lleva a la vista. */
  const [approvalBillingBlocked, setApprovalBillingBlocked] = useState(false);
  const approvalBillingRef = useRef<HTMLDivElement>(null);

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
    setAllowsOvertime(project.allowsOvertime);
    setIsInternal(project.isInternal);
    setServerError(null);
    setPaymentPlan(paymentPlanFromProject(project));
    setPaymentPlanDirty(false);
    setPaymentPlanError(null);
    setCoveredProjectIds(null);
    setPlanDraft(null);
    setApprovalBillingBlocked(false);
  }, [open, project, reset]);

  const clientId = watch('clientId') ?? '';
  const leaderUserId = watch('leaderUserId') ?? '';
  const commercialManagerUserId = watch('commercialManagerUserId') ?? '';
  const teamsValue = watch('teams') ?? [];

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' }, { enabled: open });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' }, { enabled: open });
  const { data: pmoUsers } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'pmo' }, { enabled: open });
  // El líder de un equipo puede ser un líder o un PMO (p. ej. el equipo PMO lo lidera alguien con rol pmo).
  const teamLeaderCandidates = [...(leaders?.items ?? []), ...(pmoUsers?.items ?? [])].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, 'es'),
  );
  const { data: commercialUsers } = useUsersList(
    { page: 1, pageSize: 200, sortField: 'firstName', isCommercialManager: true },
    { enabled: open },
  );
  const { data: teamsCatalog } = useTeamsList({ page: 1, pageSize: 50, sortField: 'name' }, { enabled: open });

  // Soporte: proyectos de desarrollo terminados que cubre el contrato — viven en el contrato
  // (`support_plan_projects`), no en el proyecto, así que se guardan aparte con `useUpdateSupportPlan`.
  // Mismo criterio que la sección equivalente de `NewProjectPage`: 1 = "Único", 2+ = "Consolidado".
  const savedClientId = project.client?.id ?? null;
  const { data: clientSupportPlans } = useSupportPlansForClient(open && !isDevelopment ? savedClientId : null);
  // Solo el contrato vigente: el proyecto puede arrastrar contratos terminados y editar uno de esos no cambia nada visible.
  const supportPlan = clientSupportPlans?.find((plan) => plan.projectId === project.id && plan.status === 'active') ?? null;
  const { data: supportPlanDetail } = useSupportPlanDetail(supportPlan?.id ?? null);
  const updateSupportPlan = useUpdateSupportPlan(supportPlan?.id ?? '', savedClientId ?? undefined);
  const { data: finishedProjects } = useProjectsList(
    { clientId: savedClientId ?? undefined, type: 'development', status: ['finished'], page: 1, pageSize: 200 },
    { enabled: open && !isDevelopment && Boolean(savedClientId) },
  );
  // Sin enlaces, el detalle del contrato devuelve el propio contenedor como "cubierto" — no es un proyecto terminado.
  const savedCoveredProjects = (supportPlanDetail?.linkedProjects ?? []).filter((linked) => linked.id !== project.id);
  /** `null` = sin tocar: se muestra lo guardado y no se manda nada al contrato. */
  const [coveredProjectIds, setCoveredProjectIds] = useState<string[] | null>(null);
  const selectedCoveredIds = coveredProjectIds ?? savedCoveredProjects.map((linked) => linked.id);
  // Un proyecto cubierto que se reabrió ya no sale entre los terminados, pero sigue enlazado: se muestra igual para poder quitarlo.
  const coveredCandidates = [
    ...(finishedProjects?.items ?? []).map((candidate) => ({ id: candidate.id, name: candidate.name, status: candidate.status })),
    ...savedCoveredProjects.filter((linked) => !finishedProjects?.items.some((candidate) => candidate.id === linked.id)),
  ];

  // Tipo de soporte, política de excedente y HH del plan viven en el contrato (`support_plans`), no en el
  // proyecto: son la lógica de venta por tipo de paquete (períodos mensuales, saldo acumulable, bolsa).
  /** `null` = sin tocar: se muestra lo guardado y no se manda nada al contrato. */
  const [planDraft, setPlanDraft] = useState<SupportPlanDraft | null>(null);
  // Del detalle y no del listado: el valor de la hora extra solo viene en el detalle — partir sin él lo mandaría en 0 al guardar.
  const savedPlanDraft: SupportPlanDraft | null =
    supportPlan && supportPlanDetail
      ? {
          planType: supportPlanDetail.planType,
          surplusPolicy: supportPlanDetail.surplusPolicy,
          contractedHours: supportPlanDetail.contractedHours,
          planValueUf: String(supportPlanDetail.planValueUf),
          extraHourValueUf: String(supportPlanDetail.extraHourValueUf),
          currency: supportPlanDetail.currency,
        }
      : null;
  const currentPlanDraft = planDraft ?? savedPlanDraft;
  const editPlanDraft = (patch: Partial<SupportPlanDraft>) => {
    if (!currentPlanDraft) return;
    const next = { ...currentPlanDraft, ...patch };
    // Mensual necesita política de excedente; Bolsa y A demanda no la usan.
    if (next.planType === 'monthly' && !next.surplusPolicy) next.surplusPolicy = 'accumulate';
    if (next.planType !== 'monthly') next.surplusPolicy = null;
    if (next.planType === 'on_demand') next.contractedHours = 0;
    setPlanDraft(next);
  };

  // Las HH mensuales son las del plan; el saldo acumulado de meses anteriores se suma aparte en cada
  // período (`reusedBalanceHours`). Se muestra el desglose del mes en curso para que no se confundan.
  const currentPeriod = supportPlanDetail?.summary.currentPeriod ?? null;
  const currentPeriodBreakdown =
    currentPeriod && currentPlanDraft?.planType === 'monthly' && savedPlanDraft?.planType === 'monthly'
      ? `Este mes: ${formatPlanHours(currentPeriod.planHours)} h del plan + ${formatPlanHours(currentPeriod.priorSurplusHours)} h acumuladas de meses anteriores = ${formatPlanHours(currentPeriod.capacityHours)} h disponibles.`
      : null;

  // Facturación cobra HH × valor hora (la bolsa una vez, el mensual cada mes): se muestra el monto resultante para que no se lea como cuota.
  const planHourValue = Number(currentPlanDraft?.planValueUf) || 0;
  const planChargeHint =
    currentPlanDraft && currentPlanDraft.planType !== 'on_demand' && currentPlanDraft.contractedHours > 0 && planHourValue > 0
      ? `${currentPlanDraft.planType === 'bundle' ? 'Monto de la bolsa' : 'Cuota mensual'}: ${formatPlanHours(currentPlanDraft.contractedHours)} HH × ${formatMoney(planHourValue, currentPlanDraft.currency)} = ${formatMoney(currentPlanDraft.contractedHours * planHourValue, currentPlanDraft.currency)}.`
      : undefined;

  const toggleCoveredProject = (projectId: string) =>
    setCoveredProjectIds(
      selectedCoveredIds.includes(projectId)
        ? selectedCoveredIds.filter((id) => id !== projectId)
        : [...selectedCoveredIds, projectId],
    );

  const newModuleForm = useForm<z.input<typeof createProjectModuleSchema>, unknown, CreateProjectModuleInput>({
    resolver: zodResolver(createProjectModuleSchema),
    defaultValues: { name: '', initialStage: 'discovery' },
  });

  // Entregas estimadas del módulo nuevo: el módulo todavía no existe (no hay
  // `moduleId` para colgarlas), así que se juntan acá y recién se crean —
  // igual que en `NewProjectPage` — apenas responde `createModule`.
  const [newModuleDeliveries, setNewModuleDeliveries] = useState<DeliveryDraft[]>([]);
  const nextNewModuleDeliveryId = useRef(1);

  const removeNewModuleDelivery = (localId: number) => {
    setNewModuleDeliveries((prev) => prev.filter((delivery) => delivery.localId !== localId));
  };

  // Modal único "Nueva entrega" / "Editar entrega" — reusado por los módulos ya guardados
  // (mutación inmediata) y por el módulo que todavía se está armando (solo en memoria).
  const [deliveryModal, setDeliveryModal] = useState<DeliveryModalTarget | null>(null);

  const deliveryModalInitialValues: DeliveryModalValues = (() => {
    if (!deliveryModal || !deliveryModal.delivery) return EMPTY_DELIVERY_MODAL_VALUES;
    const { delivery } = deliveryModal;
    return {
      teamId: delivery.teamId ?? '',
      name: delivery.name ?? '',
      description: delivery.description ?? '',
      estimatedDate: delivery.estimatedDate,
      segmentId: delivery.segmentId ?? '',
    };
  })();

  const onConfirmDeliveryModal = async (values: DeliveryModalValues) => {
    if (!deliveryModal) return;

    if (deliveryModal.kind === 'draft') {
      setNewModuleDeliveries((prev) =>
        deliveryModal.delivery
          ? prev.map((d) => (d.localId === deliveryModal.delivery!.localId ? { ...values, localId: d.localId } : d))
          : [...prev, { ...values, localId: nextNewModuleDeliveryId.current++ }],
      );
      setDeliveryModal(null);
      return;
    }

    const { moduleId, delivery } = deliveryModal;
    const input = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      teamId: values.teamId || undefined,
      segmentId: values.segmentId || null,
      estimatedDate: values.estimatedDate,
    };
    try {
      if (delivery) {
        await updateDelivery.mutateAsync({ projectId: project.id, moduleId, deliveryId: delivery.id, input });
      } else {
        await addDelivery.mutateAsync({ projectId: project.id, moduleId, input });
      }
      setDeliveryModal(null);
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo guardar la entrega.');
    }
  };

  // Tiempos de ejecución del módulo nuevo: mismo criterio que `newModuleDeliveries` — se juntan
  // acá y recién se crean apenas responde `createModule`.
  const [newModuleSegments, setNewModuleSegments] = useState<SegmentDraft[]>([]);
  const nextNewModuleSegmentId = useRef(1);

  // Tiempos de ejecución de la fase de la entrega — los del módulo en borrador aún no tienen id.
  const deliveryModalSegmentOptions = !deliveryModal
    ? []
    : deliveryModal.kind === 'existing'
      ? (project.modules.find((m) => m.id === deliveryModal.moduleId)?.segments ?? []).map((segment) =>
          toDeliverySegmentOption(segment.id, segment),
        )
      : newModuleSegments.map((segment) => toDeliverySegmentOption(draftSegmentKey(segment.localId), segment));

  const removeNewModuleSegment = (localId: number) => {
    setNewModuleSegments((prev) => prev.filter((segment) => segment.localId !== localId));
  };

  // Modal único "Nuevo tiempo de ejecución" / "Editar tiempo de ejecución" — mismo criterio que `deliveryModal`.
  const [segmentModal, setSegmentModal] = useState<SegmentModalTarget | null>(null);

  const segmentModalInitialValues: ExecutionSegmentModalValues = (() => {
    if (!segmentModal || !segmentModal.segment) return EMPTY_EXECUTION_SEGMENT_MODAL_VALUES;
    return segmentModal.kind === 'existing' ? segmentToModalValues(segmentModal.segment) : segmentModal.segment;
  })();

  const onConfirmSegmentModal = async (values: ExecutionSegmentModalValues) => {
    if (!segmentModal) return;

    if (segmentModal.kind === 'draft') {
      setNewModuleSegments((prev) =>
        segmentModal.segment
          ? prev.map((s) => (s.localId === segmentModal.segment!.localId ? { ...values, localId: s.localId } : s))
          : [...prev, { ...values, localId: nextNewModuleSegmentId.current++ }],
      );
      setSegmentModal(null);
      return;
    }

    const { moduleId, segment } = segmentModal;
    const input = toSegmentInput(values);
    try {
      if (segment) {
        await updateSegment.mutateAsync({ projectId: project.id, moduleId, segmentId: segment.id, input });
      } else {
        await createSegment.mutateAsync({ projectId: project.id, moduleId, input });
      }
      setSegmentModal(null);
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo guardar el tiempo de ejecución.');
    }
  };

  // Quitar un tiempo de ejecución, una entrega o una fase ya guardados es irreversible: acá solo se
  // marcan (`id → moduleId`) y recién se borran en "Guardar cambios" — "Cancelar" los descarta.
  const [pendingSegmentRemovals, setPendingSegmentRemovals] = useState<Record<string, string>>({});
  const [pendingDeliveryRemovals, setPendingDeliveryRemovals] = useState<Record<string, string>>({});
  const [pendingModuleRemovals, setPendingModuleRemovals] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setPendingSegmentRemovals({});
    setPendingDeliveryRemovals({});
    setPendingModuleRemovals({});
  }, [open]);

  const togglePendingRemoval = (
    setPending: Dispatch<SetStateAction<Record<string, string>>>,
    id: string,
    value: string,
  ) =>
    setPending((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = value;
      return next;
    });

  /** Aplica las eliminaciones marcadas — cada una que sale bien se saca de la lista, para que un reintento no la repita. */
  const applyPendingRemovals = async () => {
    for (const moduleId of Object.keys(pendingModuleRemovals)) {
      await deleteModule.mutateAsync({ projectId: project.id, moduleId });
      setPendingModuleRemovals((prev) => omitKey(prev, moduleId));
    }
    for (const [segmentId, moduleId] of Object.entries(pendingSegmentRemovals)) {
      if (moduleId in pendingModuleRemovals) continue;
      await deleteSegment.mutateAsync({ projectId: project.id, moduleId, segmentId });
      setPendingSegmentRemovals((prev) => omitKey(prev, segmentId));
    }
    for (const [deliveryId, moduleId] of Object.entries(pendingDeliveryRemovals)) {
      if (moduleId in pendingModuleRemovals) continue;
      await removeDelivery.mutateAsync({ projectId: project.id, moduleId, deliveryId });
      setPendingDeliveryRemovals((prev) => omitKey(prev, deliveryId));
    }
  };

  const onCreateModule = newModuleForm.handleSubmit(async (values) => {
    try {
      const module = await createModule.mutateAsync({ projectId: project.id, input: values });
      // Primero los tramos: las entregas del borrador los referencian por su clave local.
      const pendingSegments = newModuleSegments.filter(
        (segment) => segment.teamId && segment.name.trim() && segment.startDate && segment.endDate,
      );
      const segmentIdsByDraftKey = new Map(
        await Promise.all(
          pendingSegments.map(
            async (segment) =>
              [
                draftSegmentKey(segment.localId),
                (await createSegment.mutateAsync({ projectId: project.id, moduleId: module.id, input: toSegmentInput(segment) })).id,
              ] as const,
          ),
        ),
      );
      const pendingDeliveries = newModuleDeliveries.filter((delivery) => delivery.estimatedDate && delivery.name.trim());
      if (pendingDeliveries.length > 0) {
        await Promise.all(
          pendingDeliveries.map((delivery) =>
            addDelivery.mutateAsync({
              projectId: project.id,
              moduleId: module.id,
              input: {
                name: delivery.name.trim(),
                description: delivery.description.trim() || undefined,
                teamId: delivery.teamId || undefined,
                segmentId: resolveDraftSegmentId(delivery.segmentId, segmentIdsByDraftKey),
                estimatedDate: delivery.estimatedDate,
              },
            }),
          ),
        );
      }
      toast.success('Se agregó el módulo.');
      newModuleForm.reset({ name: '', initialStage: 'discovery' });
      setNewModuleDeliveries([]);
      setNewModuleSegments([]);
      setShowNewModuleForm(false);
    } catch (moduleError) {
      toast.error(moduleError instanceof ApiRequestError ? moduleError.message : 'No se pudo agregar el módulo.');
    }
  });

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

  /** Las HH de la fase son obligatorias (base del avance real): vacío o 0 no se guarda y vuelve al valor anterior. */
  const onBlurModuleHours = (module: ProjectModule) => {
    const next = Number(moduleDraft(module).estimatedHours);
    if (!(next > 0)) {
      setModuleDraftField(module, { estimatedHours: toModuleEditDraft(module).estimatedHours });
      toast.error('Las horas estimadas de la fase son obligatorias y deben ser mayores a 0.');
      return;
    }
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

  const estadoOptions = ESTADO_OPTIONS_BY_TIPO[tipo];
  const totalTeamHours = teamsValue.reduce((sum, team) => sum + (Number(team.assignedHours) || 0), 0);
  /** Activar por primera vez un Aprobado requiere Hito 0 manual también si estaba Detenido. */
  const isManualHito0 = isDevelopment && tipo === 'aprobado' && project.hito0At == null && project.status !== 'active' && estado === 'active';
  /** En Prospecto la estimación aún no se completa: fechas y horas se ingresan al pasar a Cotización (prototipo: `renderEstimacion()`). */
  const estimationDisabled = isDevelopment && tipo === 'prospecto';
  /** Hito 0 permite corregir HH vendidas; el motivo es obligatorio si su valor realmente cambia. */
  const soldHoursChangedAfterHito0 =
    project.hito0At != null && !supportPlan && !estimationDisabled &&
    Number(watch('soldHours')) !== project.soldHours;
  // Avisar en cuanto cambian las HH, sin esperar a que el usuario intente guardar.
  const soldHoursChangeReasonMissing =
    soldHoursChangedAfterHito0 && !watch('soldHoursChangeReason')?.trim();
  /** Finalizado: Estado, etapa de avance y etapa de cada fase quedan fijos (se reabre volviendo a "Proyecto aprobado"). */
  const isFinalized = isDevelopment && tipo === 'finalizado';
  /** Solo Finalizado tiene el Estado bloqueado. Prospecto/Cotización permiten pausar y reanudar. */
  const estadoLocked = isFinalized;
  /** La etapa de avance solo se edita en proyectos aprobados y activos. */
  const phaseEnabled = tipo === 'aprobado' && estado === 'active';
  /** Antes de Aprobado son horas estimadas para la cotización; al aprobarse quedan como horas vendidas. */
  const hoursLabel = isDevelopment && (tipo === 'prospecto' || tipo === 'cotizacion') ? 'HH estimadas' : 'HH vendidas';
  /** Al pasar a Aprobado el plan de pago debe tener montos — se avisa apenas se elige el tipo y bloquea el guardado. */
  const approvalBillingIssue =
    isDevelopment && !isInternal && tipo === 'aprobado' && project.salesStage !== 'approved'
      ? missingApprovalBillingData(paymentPlan)
      : null;

  const handleTipoChange = (nextTipo: ProjectTipo) => {
    setTipo(nextTipo);
    const mappedSalesStage = TIPO_TO_SALES_STAGE[nextTipo];
    if (mappedSalesStage) setValue('salesStage', mappedSalesStage, { shouldValidate: true });
    const options = ESTADO_OPTIONS_BY_TIPO[nextTipo];
    if (options.includes(estado)) return;
    // Reabrir un finalizado que ya pasó el Hito 0 lo deja Activo, no "No iniciado".
    const reopensActive = nextTipo === 'aprobado' && project.hito0At != null;
    setEstado(reopensActive ? 'active' : ESTADO_DEFAULT_BY_TIPO[nextTipo]);
  };

  const toggleTeam = (teamId: string) => {
    const index = teamFields.findIndex((field) => field.teamId === teamId);
    if (index >= 0) removeTeam(index);
    else appendTeam({ teamId, leaderUserId: undefined, memberCount: undefined, assignedHours: undefined });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (isDevelopment && !values.commercialManagerUserId) {
      setError('commercialManagerUserId', { message: 'Selecciona el responsable comercial.' });
      return;
    }
    if (isManualHito0 && !manualActivationReason.trim()) {
      setServerError('Escribe el motivo o la referencia de la activación (ej. contrato firmado, orden de compra).');
      return;
    }
    if (
      project.hito0At != null &&
      values.soldHours !== undefined &&
      values.soldHours !== project.soldHours &&
      !values.soldHoursChangeReason?.trim()
    ) {
      setError('soldHoursChangeReason', { message: 'Indica el motivo del ajuste de HH vendidas.' });
      return;
    }
    // En Prospecto el plan de pago no se edita (ver `estimationDisabled`); aunque se haya tocado antes de volver a Prospecto, no se manda.
    // Un proyecto interno no se cobra: su plan de pago no se edita ni se manda.
    const sendPaymentPlan = isDevelopment && paymentPlanDirty && !estimationDisabled && !isInternal;
    if (approvalBillingIssue) {
      setApprovalBillingBlocked(true);
      approvalBillingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (sendPaymentPlan) {
      const planError = validatePaymentPlan(paymentPlan);
      setPaymentPlanError(planError);
      if (planError) return;
    }
    // Con contrato de soporte, las HH del proyecto son las del plan: se editan en "Contrato de soporte" y el backend las
    // sincroniza al guardar el contrato — mandarlas acá dejaría HH vendidas y bolsa desalineadas.
    const baseValues = supportPlan ? { ...values, soldHours: undefined, supportHours: undefined } : values;
    const projectValues = isDevelopment && isInternal !== project.isInternal ? { ...baseValues, isInternal } : baseValues;
    const statusChanged = isDevelopment && estado !== project.status;
    const statusInput = {
      projectId: project.id,
      input: { status: estado, ...(isManualHito0 ? { reason: manualActivationReason.trim() } : {}) },
    };
    // Si un Aprobado activo vuelve a Prospecto/Cotización, primero deja de estar Activo:
    // el backend impide una etapa comercial no aprobada con estado operativo Activo.
    const pauseBeforeDemotion = statusChanged && project.status === 'active' &&
      (tipo === 'prospecto' || tipo === 'cotizacion');
    try {
      if (pauseBeforeDemotion) await changeStatus.mutateAsync(statusInput);
      await updateProject.mutateAsync({
        projectId: project.id,
        input: sendPaymentPlan ? { ...projectValues, ...paymentPlanPayload(paymentPlan) } : projectValues,
      });
      await applyPendingRemovals();
      if (supportPlan) {
        const planInput: UpdateSupportPlanInput = {};
        if (coveredProjectIds && !sameIds(coveredProjectIds, savedCoveredProjects.map((linked) => linked.id))) {
          planInput.developmentProjectIds = coveredProjectIds;
        }
        if (planDraft && savedPlanDraft && !samePlanDraft(planDraft, savedPlanDraft)) {
          planInput.planType = planDraft.planType;
          planInput.surplusPolicy = planDraft.surplusPolicy;
          planInput.contractedHours = planDraft.contractedHours;
          planInput.planValueUf = Number(planDraft.planValueUf) || 0;
          planInput.extraHourValueUf = Number(planDraft.extraHourValueUf) || 0;
          planInput.currency = planDraft.currency;
        }
        if (Object.keys(planInput).length > 0) await updateSupportPlan.mutateAsync(planInput);
      }
      if (statusChanged && !pauseBeforeDemotion) await changeStatus.mutateAsync(statusInput);
      if (project.canAuthorizeOvertime && allowsOvertime !== project.allowsOvertime) {
        await setOvertimeAuthorization.mutateAsync({ projectId: project.id, input: { allowsOvertime } });
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

  const deliveryModalTeamOptions = teamFields.map((field) => ({
    value: field.teamId,
    label:
      teamsCatalog?.items.find((team) => team.id === field.teamId)?.name ??
      project.teams.find((t) => t.teamId === field.teamId)?.teamName ??
      field.teamId,
  }));

  return (
    <>
    <Modal
      open={open}
      wide
      side
      title="Editar proyecto"
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="edit-project-form"
            loading={isSubmitting}
            loadingText="Guardando…"
            disabled={soldHoursChangeReasonMissing}
          >
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

          <div className={styles.row}>
            <Select
              label="Líder Kabeli a cargo"
              placeholder="Sin asignar"
              options={assignableOptions(leaders?.items ?? [], (user) => ({ value: user.id, label: user.fullName, status: user.status }), leaderUserId)}
              disabled={!isManagement}
              helperText={isManagement ? undefined : 'Solo Gerencia/PMO puede reasignar el proyecto a otro líder.'}
              // Controlado (no `register` directo): si la lista de líderes todavía no cargó cuando el
              // form hace su `reset()` inicial, un `<select>` no controlado se queda pegado en el
              // placeholder aunque el proyecto sí tenga líder — el valor real vive en el form, la opción
              // simplemente no existía todavía en el DOM. Controlado, React la selecciona apenas aparece.
              value={leaderUserId}
              onChange={(event) => setValue('leaderUserId', event.target.value || null, { shouldValidate: true })}
            />
            {/* Prototipo `kora-editar-proyecto.html`: visible y obligatorio en todos los tipos, no solo Prospecto/Cotización. */}
            {isDevelopment && (
              <Select
                label="Responsable comercial"
                placeholder="Sin asignar"
                required
                helperText="Ejecutivo comercial de Kabeli a cargo de la cuenta."
                errorText={errors.commercialManagerUserId?.message}
                options={assignableOptions(commercialUsers?.items ?? [], (user) => ({ value: user.id, label: user.fullName, status: user.status }), commercialManagerUserId)}
                value={commercialManagerUserId}
                onChange={(event) => setValue('commercialManagerUserId', event.target.value || null, { shouldValidate: true })}
              />
            )}
          </div>

          {isDevelopment && (
            <div className={styles.row3}>
              <Select
                label="Tipo de proyecto"
                options={TIPO_OPTIONS}
                value={tipo}
                onChange={(event) => handleTipoChange(event.target.value as ProjectTipo)}
              />
              <Select
                label="Estado"
                options={estadoOptions.map((status) => ({ value: status, label: estadoLabel(tipo, status, project.status, project.hito0At != null) }))}
                value={estado}
                disabled={estadoLocked}
                onChange={(event) => setEstado(event.target.value as ProjectStatus)}
              />
              <Select
                label="Etapa de avance"
                placeholder="Sin definir"
                options={PHASE_OPTIONS}
                helperText={phaseEnabled || isFinalized ? undefined : 'Solo para proyectos activos.'}
                // Deshabilitado, react-hook-form no lo envía y la etapa guardada se mantiene.
                disabled={!phaseEnabled}
                {...register('phase', { setValueAs: emptyToNull })}
              />
            </div>
          )}

          {isDevelopment && (
            <div>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isInternal}
                  disabled={!isManagement}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                Proyecto interno
              </label>
              <p className={styles.hint}>
                {isManagement
                  ? 'Proyecto de la propia empresa: no lleva monto ni plan de pago, no aparece en Facturación y no envía correos de cobro.'
                  : 'Solo Gerencia/PMO puede marcar o desmarcar un proyecto como interno.'}
              </p>
            </div>
          )}

          {approvalBillingIssue && (
            <div
              ref={approvalBillingRef}
              className={approvalBillingBlocked ? styles.alert : styles.warnBox}
              role={approvalBillingBlocked ? 'alert' : 'status'}
            >
              <AlertIcon size={18} className={styles.alertIcon} />
              <span>{approvalBillingIssue}</span>
            </div>
          )}
        </div>

        {isDevelopment && estado === 'on_hold' && (
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

        {isManualHito0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Activación manual (Hito 0 sin factura)</h3>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="manualActivationReason">
                Motivo o referencia
              </label>
              <textarea
                id="manualActivationReason"
                className={styles.textarea}
                placeholder="Ej. Contrato firmado el 20-09-2026, orden de compra N°123, etc."
                value={manualActivationReason}
                onChange={(e) => setManualActivationReason(e.target.value)}
              />
            </div>
            <p className={styles.hint}>
              {isInternal
                ? 'Un proyecto interno no tiene facturas: se activa siempre de forma manual.'
                : 'Aún no hay factura del primer tramo.'}{' '}
              Al activarlo manualmente queda como Hito 0 de origen manual, comienzan a correr las horas y el motivo
              queda registrado en la bitácora.
            </p>
          </div>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Fechas y horas</h3>
          {estimationDisabled && (
            <p className={styles.hint}>
              En Prospecto la estimación aún no se completa. Las fechas y horas estimadas se ingresan cuando el
              proyecto pasa a Cotización.
            </p>
          )}
          <div className={styles.row3}>
            <TextField
              label="Fecha de inicio"
              type="date"
              disabled={estimationDisabled}
              {...register('startDate', { setValueAs: emptyToNull })}
            />
            <TextField
              label="Fecha de fin"
              type="date"
              disabled={estimationDisabled}
              {...register('endDate', { setValueAs: emptyToNull })}
            />
            {/* En soporte con contrato, las HH se editan una sola vez en "Contrato de soporte" (bolsa / HH mensuales). */}
            {!supportPlan && (
              <TextField
                label={hoursLabel}
                type="number"
                min={0}
                disabled={estimationDisabled}
                errorText={errors.soldHours?.message}
                {...register('soldHours')}
              />
            )}
          </div>
          {soldHoursChangedAfterHito0 && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="soldHoursChangeReason">
                Motivo del ajuste de HH vendidas
              </label>
              <textarea
                id="soldHoursChangeReason"
                className={styles.textarea}
                placeholder="Ej. Ampliación de alcance aprobada por el cliente."
                aria-invalid={soldHoursChangeReasonMissing || Boolean(errors.soldHoursChangeReason)}
                aria-describedby={soldHoursChangeReasonMissing ? 'sold-hours-change-reason-warning' : undefined}
                {...register('soldHoursChangeReason')}
              />
              {soldHoursChangeReasonMissing && (
                <div id="sold-hours-change-reason-warning" className={styles.warnBox} role="alert">
                  <AlertIcon size={18} className={styles.alertIcon} />
                  <span>Debes ingresar un motivo del ajuste de HH vendidas para habilitar «Guardar cambios».</span>
                </div>
              )}
              {errors.soldHoursChangeReason && (
                <p className={styles.hint} role="alert">{errors.soldHoursChangeReason.message}</p>
              )}
              <p className={styles.hint}>El valor anterior, el nuevo y este motivo quedarán registrados en la bitácora.</p>
            </div>
          )}

          {project.canAuthorizeOvertime && (
            <div>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={allowsOvertime} onChange={(e) => setAllowsOvertime(e.target.checked)} />
                Autorizar horas extra
              </label>
              <p className={styles.hint}>Permite registrar horas marcadas como horas extra en este proyecto.</p>
            </div>
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

        {!isDevelopment && currentPlanDraft && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Contrato de soporte</h3>
            <div className={styles.field}>
              <span className={styles.label}>Tipo de soporte</span>
              <SegmentedControl
                aria-label="Tipo de soporte"
                options={SUPPORT_PLAN_TYPE_OPTIONS}
                value={currentPlanDraft.planType}
                onChange={(value) => editPlanDraft({ planType: value as SupportPlanType })}
              />
            </div>
            {currentPlanDraft.planType === 'monthly' && (
              <div className={styles.field}>
                <span className={styles.label}>Política de excedente</span>
                <SegmentedControl
                  aria-label="Política de excedente"
                  options={SUPPORT_SURPLUS_POLICY_OPTIONS}
                  value={currentPlanDraft.surplusPolicy ?? ''}
                  onChange={(value) => editPlanDraft({ surplusPolicy: value as SupportSurplusPolicy })}
                />
              </div>
            )}
            {currentPlanDraft.planType !== 'on_demand' && (
              <TextField
                label={currentPlanDraft.planType === 'bundle' ? 'Cantidad de HH de la bolsa' : 'Cantidad de HH mensuales'}
                type="number"
                min={0}
                step="any"
                value={String(currentPlanDraft.contractedHours)}
                onChange={(event) => editPlanDraft({ contractedHours: Number(event.target.value) || 0 })}
                helperText={currentPeriodBreakdown ?? undefined}
              />
            )}
            {/* Mismos campos que al crear (`NewProjectPage`): una sola moneda para ambos valores. */}
            <div className={styles.row}>
              <MoneyField
                label="Valor de la hora"
                currency={currentPlanDraft.currency}
                onCurrencyChange={(value) => editPlanDraft({ currency: value as SupportPlanCurrency })}
                currencyOptions={SUPPORT_CURRENCY_OPTIONS}
                step="0.01"
                min={0}
                value={currentPlanDraft.planValueUf}
                onChange={(event) => editPlanDraft({ planValueUf: event.target.value })}
              />
              {currentPlanDraft.planType !== 'on_demand' && (
                <MoneyField
                  label="Valor de horas extra"
                  currency={currentPlanDraft.currency}
                  onCurrencyChange={(value) => editPlanDraft({ currency: value as SupportPlanCurrency })}
                  currencyOptions={SUPPORT_CURRENCY_OPTIONS}
                  step="0.01"
                  min={0}
                  value={currentPlanDraft.extraHourValueUf}
                  onChange={(event) => editPlanDraft({ extraHourValueUf: event.target.value })}
                />
              )}
            </div>
            {planChargeHint && <p className={styles.hint}>{planChargeHint}</p>}
          </div>
        )}

        {!isDevelopment && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Tiempos de respuesta (SLA)</h3>
            <SupportSlaNote />
          </div>
        )}

        {!isDevelopment && supportPlan && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Proyectos terminados incluidos en este contrato</h3>
            <p className={styles.hint}>
              Un contrato de soporte puede cubrir uno o varios proyectos terminados del mismo cliente. Sin ninguno
              marcado, el contrato queda solo con este proyecto de soporte. Con uno, el contrato queda "Único". Con
              dos o más, queda "Consolidado": comparten una sola bolsa de horas y una sola facturación.
            </p>
            {coveredCandidates.length === 0 ? (
              <p className={styles.hint}>Este cliente todavía no tiene proyectos de desarrollo terminados.</p>
            ) : (
              <div className={styles.teamsGrid}>
                {coveredCandidates.map((candidate) => (
                  <label key={candidate.id} className={styles.teamCheckbox}>
                    <input
                      type="checkbox"
                      checked={selectedCoveredIds.includes(candidate.id)}
                      onChange={() => toggleCoveredProject(candidate.id)}
                    />
                    {candidate.name}{' '}
                    <span className={styles.coveredProjectStatus}>— {PROJECT_STATUS_LABELS[candidate.status]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {isDevelopment && !isInternal && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Plan de pago</h3>
            <p className={styles.hint}>
              {estimationDisabled ? (
                <>
                  En Prospecto el plan de pago aún no se completa. El monto del contrato y sus tramos se ingresan cuando
                  el proyecto pasa a Cotización.
                </>
              ) : (
                <>
                  Cada tramo queda <b>Por facturar</b> cuando se cumple su hito y se avisa por correo a Finanzas y
                  Gerencia. Los tramos ya facturados no se editan desde acá.
                </>
              )}
            </p>
            <PaymentPlanEditor
              value={paymentPlan}
              disabled={estimationDisabled}
              onChange={(next) => {
                setPaymentPlan(next);
                setPaymentPlanDirty(true);
                setPaymentPlanError(null);
              }}
            />
            {paymentPlanError && (
              <div className={styles.alert} role="alert">
                <AlertIcon size={18} className={styles.alertIcon} />
                <span>{paymentPlanError}</span>
              </div>
            )}
          </div>
        )}

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
                        options={assignableOptions(teamLeaderCandidates, (user) => ({ value: user.id, label: user.fullName, status: user.status }), teamsValue[index]?.leaderUserId)}
                        // Controlado por la misma razón que "Líder Kabeli a cargo": si los candidatos cargan
                        // después del `reset()`, un `<select>` no controlado queda en "Sin asignar".
                        value={teamsValue[index]?.leaderUserId ?? ''}
                        onChange={(event) =>
                          setValue(`teams.${index}.leaderUserId`, event.target.value || null, { shouldDirty: true })
                        }
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
              {project.modules.map((module, index) => {
                const moduleRemoved = module.id in pendingModuleRemovals;
                return (
                  <div
                    key={module.id}
                    className={`${styles.moduleEditCard} ${moduleRemoved ? styles.moduleEditCardPendingRemoval : ''}`}
                  >
                    <div className={styles.moduleEditHead}>
                      <span>
                        Fase {index + 1} — {module.name} ({PROJECT_MODULE_STAGE_LABELS[module.initialStage]})
                        {moduleRemoved && <span className={deliveryModalStyles.pendingRemovalNote}> · Se eliminará al guardar</span>}
                      </span>
                      {moduleRemoved ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => togglePendingRemoval(setPendingModuleRemovals, module.id, module.name)}
                        >
                          Deshacer
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => togglePendingRemoval(setPendingModuleRemovals, module.id, module.name)}
                          aria-label={`Eliminar ${module.name}`}
                        >
                          <TrashIcon size={16} />
                        </Button>
                      )}
                    </div>

                    {!moduleRemoved && (
                      <>
                        <div className={styles.moduleEditSubsection}>
                          <span className={styles.moduleEditSubsectionLabel}>Datos de la fase</span>
                          <TextField
                            label="Nombre del módulo"
                            value={moduleDraft(module).name}
                            onChange={(event) => setModuleDraftField(module, { name: event.target.value })}
                            onBlur={() => onBlurModuleName(module)}
                          />
                          {/* Único lugar donde se cambia — en el Roadmap la etapa solo se muestra (ver `ProjectModulesCard`). */}
                          <Select
                            label="Etapa actual"
                            options={MODULE_STAGE_OPTIONS}
                            value={module.currentStage}
                            disabled={isFinalized}
                            onChange={(event) =>
                              void onSaveModuleField(module.id, { currentStage: event.target.value as ProjectModuleStage })
                            }
                          />
                          <TextField
                            label="Horas estimadas"
                            type="number"
                            min={0}
                            required
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
                          <div className={deliveryModalStyles.subsectionHead}>
                            <span className={deliveryModalStyles.subsectionLabel}>Tiempos de ejecución por equipo</span>
                            <p className={styles.hint}>Semanas/días de cada equipo en esta Fase — es lo que dibuja el Roadmap.</p>
                          </div>
                          {module.segments.length === 0 && <p className={styles.hint}>Aún no hay tiempos de ejecución para esta fase.</p>}
                          {module.segments.map((segment) => {
                            const segmentRemoved = segment.id in pendingSegmentRemovals;
                            return (
                              <div
                                key={segment.id}
                                className={`${deliveryModalStyles.listRow} ${segmentRemoved ? deliveryModalStyles.listRowPendingRemoval : ''}`}
                              >
                                <div className={deliveryModalStyles.listInfo}>
                                  <span className={deliveryModalStyles.listName}>
                                    {segment.teamName}
                                    {segment.name && <span className={deliveryModalStyles.listNameTeam}> — {segment.name}</span>}
                                  </span>
                                  <span className={deliveryModalStyles.listMeta}>
                                    {formatDeliveryDate(segment.startDate)} → {formatDeliveryDate(segment.endDate)}
                                  </span>
                                  {segment.members.length > 0 && (
                                    <span className={deliveryModalStyles.listMeta}>{formatSegmentMembers(segment.members)}</span>
                                  )}
                                  {segmentRemoved && <span className={deliveryModalStyles.pendingRemovalNote}>Se quitará al guardar</span>}
                                </div>
                                <div className={deliveryModalStyles.listActions}>
                                  {segmentRemoved ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={deliveryModalStyles.listEditButton}
                                      onClick={() => togglePendingRemoval(setPendingSegmentRemovals, segment.id, module.id)}
                                    >
                                      Deshacer
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={deliveryModalStyles.listEditButton}
                                        onClick={() => setSegmentModal({ kind: 'existing', moduleId: module.id, segment })}
                                      >
                                        Editar
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={deliveryModalStyles.listDeleteButton}
                                        onClick={() => togglePendingRemoval(setPendingSegmentRemovals, segment.id, module.id)}
                                        aria-label="Quitar tiempo de ejecución"
                                      >
                                        <CloseIcon size={14} />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {teamFields.length === 0 ? (
                            <p className={styles.hint}>Primero asigná equipos en "Equipos e involucrados" para poder agregar tiempos de ejecución.</p>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={deliveryModalStyles.addButton}
                              iconLeft={<PlusIcon size={14} />}
                              onClick={() => setSegmentModal({ kind: 'existing', moduleId: module.id, segment: null })}
                            >
                              Agregar tiempo de ejecución
                            </Button>
                          )}
                        </div>

                        <div className={styles.moduleEditSubsection}>
                          <span className={deliveryModalStyles.subsectionLabel}>Entregas estimadas</span>
                          {module.deliveries.length === 0 && <p className={styles.hint}>Aún no hay entregas para esta fase.</p>}
                          {module.deliveries.map((delivery) => {
                            const deliveryRemoved = delivery.id in pendingDeliveryRemovals;
                            return (
                              <div
                                key={delivery.id}
                                className={`${deliveryModalStyles.listRow} ${deliveryRemoved ? deliveryModalStyles.listRowPendingRemoval : ''}`}
                              >
                                <div className={deliveryModalStyles.listInfo}>
                                  <span className={deliveryModalStyles.listName}>
                                    {delivery.name}
                                    {delivery.teamName && <span className={deliveryModalStyles.listNameTeam}> · {delivery.teamName}</span>}
                                  </span>
                                  <span className={deliveryModalStyles.listMeta}>
                                    {formatDeliveryDate(delivery.estimatedDate)} · {PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}
                                    {delivery.segmentName ? ` · ${delivery.segmentName}` : ''}
                                    {delivery.description ? ` · ${delivery.description}` : ''}
                                  </span>
                                  {deliveryRemoved && <span className={deliveryModalStyles.pendingRemovalNote}>Se quitará al guardar</span>}
                                </div>
                                <div className={deliveryModalStyles.listActions}>
                                  {deliveryRemoved ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={deliveryModalStyles.listEditButton}
                                      onClick={() => togglePendingRemoval(setPendingDeliveryRemovals, delivery.id, module.id)}
                                    >
                                      Deshacer
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={deliveryModalStyles.listEditButton}
                                        onClick={() => setDeliveryModal({ kind: 'existing', moduleId: module.id, delivery })}
                                      >
                                        Editar
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={deliveryModalStyles.listDeleteButton}
                                        onClick={() => togglePendingRemoval(setPendingDeliveryRemovals, delivery.id, module.id)}
                                        aria-label="Quitar entrega"
                                      >
                                        <CloseIcon size={14} />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {teamFields.length === 0 ? (
                            <p className={styles.hint}>Primero asigná equipos en "Equipos e involucrados" para poder agregar entregas.</p>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={deliveryModalStyles.addButton}
                              iconLeft={<PlusIcon size={14} />}
                              onClick={() => setDeliveryModal({ kind: 'existing', moduleId: module.id, delivery: null })}
                            >
                              Agregar entrega
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
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
                    required
                    errorText={newModuleForm.formState.errors.estimatedHours?.message}
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
                  <div className={deliveryModalStyles.subsectionHead}>
                    <span className={deliveryModalStyles.subsectionLabel}>Tiempos de ejecución por equipo</span>
                    <p className={styles.hint}>Semanas/días de cada equipo en esta Fase — es lo que dibuja el Roadmap.</p>
                  </div>
                  {newModuleSegments.length === 0 && <p className={styles.hint}>Aún no hay tiempos de ejecución para esta fase.</p>}
                  {newModuleSegments.map((segment) => (
                    <div key={segment.localId} className={deliveryModalStyles.listRow}>
                      <div className={deliveryModalStyles.listInfo}>
                        <span className={deliveryModalStyles.listName}>
                          {teamsCatalog?.items.find((team) => team.id === segment.teamId)?.name ?? ''}
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
                          onClick={() => setSegmentModal({ kind: 'draft', segment })}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={deliveryModalStyles.listDeleteButton}
                          onClick={() => removeNewModuleSegment(segment.localId)}
                          aria-label={`Quitar tiempo de ejecución "${segment.name}"`}
                        >
                          <CloseIcon size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {teamFields.length === 0 ? (
                    <p className={styles.hint}>Primero asigná equipos en "Equipos e involucrados" para poder agregar tiempos de ejecución.</p>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={deliveryModalStyles.addButton}
                      iconLeft={<PlusIcon size={14} />}
                      onClick={() => setSegmentModal({ kind: 'draft', segment: null })}
                    >
                      Agregar tiempo de ejecución
                    </Button>
                  )}
                </div>

                <div className={styles.moduleDeliveries}>
                  <span className={deliveryModalStyles.subsectionLabel}>Entregas estimadas</span>
                  {newModuleDeliveries.length === 0 && <p className={styles.hint}>Aún no hay entregas para esta fase.</p>}
                  {newModuleDeliveries.map((delivery) => (
                    <div key={delivery.localId} className={deliveryModalStyles.listRow}>
                      <div className={deliveryModalStyles.listInfo}>
                        <span className={deliveryModalStyles.listName}>
                          {delivery.name}
                          {delivery.teamId && (
                            <span className={deliveryModalStyles.listNameTeam}>
                              {' '}
                              · {teamsCatalog?.items.find((team) => team.id === delivery.teamId)?.name ?? ''}
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
                          onClick={() => setDeliveryModal({ kind: 'draft', delivery })}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={deliveryModalStyles.listDeleteButton}
                          onClick={() => removeNewModuleDelivery(delivery.localId)}
                          aria-label={`Quitar entrega "${delivery.name}"`}
                        >
                          <CloseIcon size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {teamFields.length === 0 ? (
                    <p className={styles.hint}>Primero asigná equipos en "Equipos e involucrados" para poder agregar entregas.</p>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={deliveryModalStyles.addButton}
                      iconLeft={<PlusIcon size={14} />}
                      onClick={() => setDeliveryModal({ kind: 'draft', delivery: null })}
                    >
                      Agregar entrega
                    </Button>
                  )}
                  <p className={styles.hint}>Cada entrega crea automáticamente un hito "Entrega a cliente" en estado Planificada.</p>
                </div>

                <div className={styles.newModuleActions}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowNewModuleForm(false);
                      setNewModuleDeliveries([]);
                      setNewModuleSegments([]);
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

    <DeliveryModal
      open={deliveryModal !== null}
      mode={deliveryModal?.delivery ? 'edit' : 'create'}
      teamOptions={deliveryModalTeamOptions}
      segmentOptions={deliveryModalSegmentOptions}
      initialValues={deliveryModalInitialValues}
      submitting={addDelivery.isPending || updateDelivery.isPending}
      onCancel={() => setDeliveryModal(null)}
      onConfirm={(values) => void onConfirmDeliveryModal(values)}
    />

    <ExecutionSegmentModal
      open={segmentModal !== null}
      mode={segmentModal?.segment ? 'edit' : 'create'}
      teamOptions={deliveryModalTeamOptions}
      initialValues={segmentModalInitialValues}
      segmentId={segmentModal?.kind === 'existing' ? (segmentModal.segment?.id ?? null) : null}
      submitting={createSegment.isPending || updateSegment.isPending}
      onCancel={() => setSegmentModal(null)}
      onConfirm={(values) => void onConfirmSegmentModal(values)}
    />
    </>
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
    soldHoursChangeReason: '',
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
      // `||`: el 0 que dejaba el guardado viejo con el campo vacío se muestra vacío (sin tope).
      memberCount: team.maxMembers || undefined,
      assignedHours: team.assignedHours ?? undefined,
    })),
  };
}

function formatPlanHours(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}

function samePlanDraft(a: SupportPlanDraft, b: SupportPlanDraft): boolean {
  return (
    a.planType === b.planType &&
    a.surplusPolicy === b.surplusPolicy &&
    a.contractedHours === b.contractedHours &&
    Number(a.planValueUf) === Number(b.planValueUf) &&
    Number(a.extraHourValueUf) === Number(b.extraHourValueUf) &&
    a.currency === b.currency
  );
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
