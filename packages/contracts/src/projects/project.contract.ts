import { z } from 'zod';
import {
  arrayQueryParam,
  isoDateTimeSchema,
  nonEmptyTrimmed,
  pageSchema,
  paginationQuerySchema,
  sortDirectionSchema,
  uuidSchema,
} from '../common/primitives';
import { clientContactSchema } from '../clients/client.contract';

/** Ver docs/DECISION-M3-ESTADOS.md: por qué son cuatro campos independientes. */

export const PROJECT_TYPES = ['development', 'support'] as const;
export const projectTypeSchema = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof projectTypeSchema>;

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectType, string>> = {
  development: 'Desarrollo',
  support: 'Soporte',
};

export const PROJECT_SALES_STAGES = ['prospect', 'quoted', 'approved'] as const;
export const projectSalesStageSchema = z.enum(PROJECT_SALES_STAGES);
export type ProjectSalesStage = z.infer<typeof projectSalesStageSchema>;

export const PROJECT_SALES_STAGE_LABELS: Readonly<Record<ProjectSalesStage, string>> = {
  prospect: 'Prospecto',
  quoted: 'Cotización',
  approved: 'Aprobado',
};

export const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'finished', 'cancelled'] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  draft: 'No iniciado',
  active: 'Activo',
  on_hold: 'Detenido',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

export const PROJECT_PHASES = ['discovery', 'development', 'testing', 'pilot', 'closed'] as const;
export const projectPhaseSchema = z.enum(PROJECT_PHASES);
export type ProjectPhase = z.infer<typeof projectPhaseSchema>;

export const PROJECT_PHASE_LABELS: Readonly<Record<ProjectPhase, string>> = {
  discovery: 'Levantamiento',
  development: 'En desarrollo',
  testing: 'Pruebas',
  pilot: 'Marcha blanca',
  closed: 'Cerrado',
};

/** Qué disparó el Hito 0 (kickoff) de un proyecto — ver `projectDetailSchema.hito0Source`. */
export const PROJECT_HITO0_SOURCES = ['auto_invoice', 'manual'] as const;
export const projectHito0SourceSchema = z.enum(PROJECT_HITO0_SOURCES);
export type ProjectHito0Source = z.infer<typeof projectHito0SourceSchema>;

export const PROJECT_PRIORITIES = ['low', 'medium', 'high'] as const;
export const projectPrioritySchema = z.enum(PROJECT_PRIORITIES);
export type ProjectPriority = z.infer<typeof projectPrioritySchema>;

export const PROJECT_PRIORITY_LABELS: Readonly<Record<ProjectPriority, string>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export const projectTeamMemberSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  teamMemberId: uuidSchema,
  userId: uuidSchema,
  fullName: z.string(),
  activity: z.string().nullable(),
  assignedHours: z.number(),
  consumedHours: z.number(),
});
export type ProjectTeamMember = z.infer<typeof projectTeamMemberSchema>;

/**
 * Equipo asignado al proyecto (v1: `equipo_proyecto`) — distinto de
 * `projectTeamMemberSchema`: este es el nivel equipo (líder, HH
 * presupuestadas), no la persona individual. `memberCount` se recalcula en
 * vivo contando `project_team_members`; `maxMembers` es el tope de
 * colaboradores que se definió al crear/editar el proyecto (`N° colaboradores`,
 * columna `project_teams.member_count`) — nulo = sin tope.
 */
export const projectTeamSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  /** Slug del equipo — `projectTeamPath` lo usa en la URL, así que la ficha del equipo resuelve por id o slug. */
  teamSlug: z.string(),
  teamName: z.string(),
  leader: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  assignedHours: z.number().nullable(),
  memberCount: z.number().int(),
  maxMembers: z.number().int().nullable(),
});
export type ProjectTeam = z.infer<typeof projectTeamSchema>;

/** Catálogo propio de la etapa del módulo/fase — independiente de `projectPhaseSchema` (avance del proyecto completo). */
export const PROJECT_MODULE_STAGES = ['discovery', 'development', 'production', 'pilot', 'closed'] as const;
export const projectModuleStageSchema = z.enum(PROJECT_MODULE_STAGES);
export type ProjectModuleStage = z.infer<typeof projectModuleStageSchema>;

export const PROJECT_MODULE_STAGE_LABELS: Readonly<Record<ProjectModuleStage, string>> = {
  discovery: 'Levantamiento',
  development: 'Desarrollo',
  production: 'Producción',
  pilot: 'Marcha blanca',
  closed: 'Finalizado',
};

export const PROJECT_MODULE_DELIVERY_STATUSES = ['planned', 'delivered', 'approved'] as const;
export const projectModuleDeliveryStatusSchema = z.enum(PROJECT_MODULE_DELIVERY_STATUSES);
export type ProjectModuleDeliveryStatus = z.infer<typeof projectModuleDeliveryStatusSchema>;

/**
 * `delivered` = el colaborador la marcó como terminada y queda esperando que un líder la apruebe o
 * rechace — por eso "Pendiente de aprobación" y no "Entregada". Un rechazo la devuelve a `planned`
 * con `rejectionReason`; en pantalla se muestra como "Rechazada" hasta que se vuelva a enviar.
 */
export const PROJECT_MODULE_DELIVERY_STATUS_LABELS: Readonly<Record<ProjectModuleDeliveryStatus, string>> = {
  planned: 'Planificada',
  delivered: 'Pendiente de aprobación',
  approved: 'Aprobada',
};

/**
 * Ciclo de vida de una entrega — ver `UpdateProjectModuleDeliveryUseCase`:
 * - `planned → delivered`: el colaborador asignado la marca como terminada (o un líder en su nombre).
 * - `delivered → approved | planned`: un líder (de proyecto o del equipo) la aprueba o la rechaza con motivo.
 * - `approved → delivered`: un líder revierte la aprobación y la devuelve a revisión.
 */
export const PROJECT_MODULE_DELIVERY_ALLOWED_TRANSITIONS: Readonly<
  Record<ProjectModuleDeliveryStatus, readonly ProjectModuleDeliveryStatus[]>
> = {
  planned: ['delivered'],
  delivered: ['approved', 'planned'],
  approved: ['delivered'],
};

export const projectModuleDeliverySchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema.nullable(),
  teamName: z.string().nullable(),
  /** Nulo en entregas creadas antes de este campo. */
  name: z.string().nullable(),
  description: z.string().nullable(),
  /** Colaborador del equipo responsable a quien se le asignó esta entrega — `null` ⇔ "Sin asignar". */
  assigneeUserId: uuidSchema.nullable(),
  assigneeName: z.string().nullable(),
  estimatedDate: z.string(),
  status: projectModuleDeliveryStatusSchema,
  /** Motivo del último rechazo del líder — se limpia al aprobar o al volver a marcarla entregada. */
  rejectionReason: z.string().nullable(),
  /**
   * ¿Quien consulta puede gestionarla (asignar, aprobar, rechazar, revertir, editar)? Líder del proyecto,
   * PMO/admin o líder del equipo responsable — mismo criterio que `UpdateProjectModuleDeliveryUseCase`.
   */
  canManage: z.boolean(),
});
export type ProjectModuleDelivery = z.infer<typeof projectModuleDeliverySchema>;

/**
 * Flujo real de una tarea ("Mis tareas" del colaborador asignado). "Atrasada"
 * no es un valor guardado — se deriva en el cliente comparando `date` con hoy
 * cuando `status !== 'done'`, igual que ya se hace con las entregas.
 */
export const PROJECT_MODULE_TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export const projectModuleTaskStatusSchema = z.enum(PROJECT_MODULE_TASK_STATUSES);
export type ProjectModuleTaskStatus = z.infer<typeof projectModuleTaskStatusSchema>;

export const PROJECT_MODULE_TASK_STATUS_LABELS: Readonly<Record<ProjectModuleTaskStatus, string>> = {
  todo: 'Por hacer',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  done: 'Completada',
};

/** Ámbito de la tarea — base del % por ámbito en "Resumen de avance" del módulo. */
export const PROJECT_MODULE_TASK_SCOPES = ['diseno', 'desarrollo', 'qa', 'revision_cliente'] as const;
export const projectModuleTaskScopeSchema = z.enum(PROJECT_MODULE_TASK_SCOPES);
export type ProjectModuleTaskScope = z.infer<typeof projectModuleTaskScopeSchema>;

export const PROJECT_MODULE_TASK_SCOPE_LABELS: Readonly<Record<ProjectModuleTaskScope, string>> = {
  diseno: 'Diseño',
  desarrollo: 'Desarrollo',
  qa: 'QA Funcional',
  revision_cliente: 'Rev. Cliente',
};

/** Tramo de trabajo de un equipo dentro de una fase/módulo — con su propio rango de fechas (Roadmap). */
export const projectModuleSegmentSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema,
  teamName: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});
export type ProjectModuleSegment = z.infer<typeof projectModuleSegmentSchema>;

export const createProjectModuleSegmentSchema = z.object({
  teamId: uuidSchema,
  name: nonEmptyTrimmed(300, 'El nombre del tramo'),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});
export type CreateProjectModuleSegmentInput = z.infer<typeof createProjectModuleSegmentSchema>;

export const updateProjectModuleSegmentSchema = createProjectModuleSegmentSchema.partial();
export type UpdateProjectModuleSegmentInput = z.infer<typeof updateProjectModuleSegmentSchema>;

/** Tarea puntual (una fecha) de una fase/módulo, por equipo y opcionalmente asignada a una persona — marcador en el Roadmap y base de "Mis tareas". */
export const projectModuleTaskSchema = z.object({
  id: uuidSchema,
  teamId: uuidSchema.nullable(),
  teamName: z.string().nullable(),
  assigneeUserId: uuidSchema.nullable(),
  assigneeName: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  startDate: z.string().nullable(),
  date: z.string(),
  estimatedHours: z.number().nullable(),
  status: projectModuleTaskStatusSchema,
  scope: projectModuleTaskScopeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  /** Motivo del último rechazo del líder — se limpia al aprobar o al volver a marcarla en revisión. */
  rejectionReason: z.string().nullable(),
});
export type ProjectModuleTask = z.infer<typeof projectModuleTaskSchema>;

export const createProjectModuleTaskSchema = z.object({
  teamId: uuidSchema.nullish(),
  assigneeUserId: uuidSchema.nullish(),
  name: nonEmptyTrimmed(300, 'El nombre de la tarea'),
  description: z.string().trim().max(2000).nullish(),
  startDate: z.iso.date().nullish(),
  date: z.iso.date(),
  estimatedHours: z.coerce.number().min(0).nullish(),
  status: projectModuleTaskStatusSchema.optional(),
  scope: projectModuleTaskScopeSchema.optional(),
});
export type CreateProjectModuleTaskInput = z.infer<typeof createProjectModuleTaskSchema>;

export const updateProjectModuleTaskSchema = createProjectModuleTaskSchema.partial().extend({
  /** Solo la persona que aprueba/rechaza (líder de equipo/proyecto) puede enviarlo — obligatorio al rechazar, se limpia (`null`) en cualquier otra transición. */
  rejectionReason: z.string().trim().max(1000).nullish(),
});
export type UpdateProjectModuleTaskInput = z.infer<typeof updateProjectModuleTaskSchema>;

/** Fase/módulo del proyecto — unidad de entrega con etapa, horas y fechas propias (ver "Fases · Módulos"). */
export const projectModuleSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  initialStage: projectModuleStageSchema,
  currentStage: projectModuleStageSchema,
  estimatedHours: z.number().nullable(),
  estimatedStartDate: z.string().nullable(),
  estimatedEndDate: z.string().nullable(),
  deliveries: z.array(projectModuleDeliverySchema),
  segments: z.array(projectModuleSegmentSchema),
  tasks: z.array(projectModuleTaskSchema),
  /** Cantidad de registros de horas con `hasBlocker` contra este módulo — proxy simple de "incidentes reportados", sin estado abierto/resuelto. */
  blockerCount: z.number().int(),
});
export type ProjectModule = z.infer<typeof projectModuleSchema>;

export const createProjectModuleSchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre del módulo'),
  initialStage: projectModuleStageSchema,
  estimatedHours: z.coerce.number().min(0).nullish(),
  estimatedStartDate: z.iso.date().nullish(),
  estimatedEndDate: z.iso.date().nullish(),
});
export type CreateProjectModuleInput = z.infer<typeof createProjectModuleSchema>;

export const updateProjectModuleSchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre del módulo').optional(),
  currentStage: projectModuleStageSchema.optional(),
  estimatedHours: z.coerce.number().min(0).nullish(),
  estimatedStartDate: z.iso.date().nullish(),
  estimatedEndDate: z.iso.date().nullish(),
});
export type UpdateProjectModuleInput = z.infer<typeof updateProjectModuleSchema>;

export const addProjectModuleDeliverySchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre de la entrega'),
  description: z.string().trim().max(2000).nullish(),
  estimatedDate: z.iso.date(),
  teamId: uuidSchema.nullish(),
  assigneeUserId: uuidSchema.nullish(),
});
export type AddProjectModuleDeliveryInput = z.infer<typeof addProjectModuleDeliverySchema>;

export const updateProjectModuleDeliverySchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre de la entrega').optional(),
  description: z.string().trim().max(2000).nullish(),
  status: projectModuleDeliveryStatusSchema.optional(),
  teamId: uuidSchema.nullish(),
  assigneeUserId: uuidSchema.nullish(),
  estimatedDate: z.iso.date().optional(),
  /** Solo quien aprueba/rechaza puede enviarlo — obligatorio al rechazar, se limpia (`null`) en cualquier otra transición. */
  rejectionReason: z.string().trim().max(1000).nullish(),
  /**
   * No se guarda en la entrega: va al registro de la bitácora. Obligatorio cuando un líder la marca
   * como terminada en nombre del colaborador asignado — por qué lo hizo sin que el colaborador la enviara.
   */
  comment: z.string().trim().max(1000).optional(),
});
export type UpdateProjectModuleDeliveryInput = z.infer<typeof updateProjectModuleDeliverySchema>;

/**
 * "evento" (hora registrada) no está acá: no es un `project_observation`, viene de `hour_entries` — ver
 * `apps/web/.../lib/hour-entry-log.ts`. "cambio_proyecto" tampoco lo crea una persona: lo genera el sistema
 * cuando cambian datos clave del proyecto (líder, HH vendidas, equipos, entregas, estado, fechas) — ver
 * `ProjectChangeLogRecorder` en el backend. Sin ciclo de vida (`status` siempre `null`), y no editable ni
 * eliminable por nadie: es un registro de auditoría, no una entrada de trabajo.
 */
export const PROJECT_OBSERVATION_TYPES = ['hito', 'incidente', 'compromiso', 'atencion', 'observacion', 'cambio_proyecto'] as const;
export const projectObservationTypeSchema = z.enum(PROJECT_OBSERVATION_TYPES);
export type ProjectObservationType = z.infer<typeof projectObservationTypeSchema>;

export const PROJECT_OBSERVATION_TYPE_LABELS: Readonly<Record<ProjectObservationType, string>> = {
  hito: 'Hito',
  incidente: 'Incidente',
  compromiso: 'Compromiso',
  atencion: 'Punto de atención',
  observacion: 'Observación general',
  cambio_proyecto: 'Cambio de proyecto',
};

export const PROJECT_OBSERVATION_STATUSES = ['abierto', 'resuelto', 'pendiente', 'cumplido', 'activo', 'rechazado'] as const;
export const projectObservationStatusSchema = z.enum(PROJECT_OBSERVATION_STATUSES);
export type ProjectObservationStatus = z.infer<typeof projectObservationStatusSchema>;

export const PROJECT_OBSERVATION_STATUS_LABELS: Readonly<Record<ProjectObservationStatus, string>> = {
  abierto: 'Abierto',
  resuelto: 'Resuelto',
  pendiente: 'Pendiente',
  cumplido: 'Cumplido',
  activo: 'Activo',
  rechazado: 'Rechazado',
};

/** Estado inicial automático según el tipo — el formulario "Agregar registro" no lo pide. `null` = sin ciclo de vida (observación general / cambio de proyecto). */
export const PROJECT_OBSERVATION_DEFAULT_STATUS: Readonly<Record<ProjectObservationType, ProjectObservationStatus | null>> = {
  hito: 'cumplido',
  incidente: 'abierto',
  compromiso: 'pendiente',
  atencion: 'activo',
  observacion: null,
  cambio_proyecto: null,
};

/**
 * Transiciones de estado que un líder de proyecto, PMO o admin puede resolver a mano desde la bitácora
 * (aprobar/rechazar/cerrar/reabrir) — ver `ResolveProjectObservationUseCase`. Los demás tipos no tienen
 * ciclo de vida accionable acá (un hito nace `cumplido`, una atención se resuelve editando su estado desde
 * el formulario, y `cambio_proyecto` no es editable por nadie).
 */
export const PROJECT_OBSERVATION_ALLOWED_TRANSITIONS: Readonly<
  Partial<Record<ProjectObservationType, Readonly<Partial<Record<ProjectObservationStatus, readonly ProjectObservationStatus[]>>>>>
> = {
  incidente: { abierto: ['resuelto'], resuelto: ['abierto'] },
  compromiso: { pendiente: ['cumplido', 'rechazado'] },
};

export const projectObservationSchema = z.object({
  id: uuidSchema,
  type: projectObservationTypeSchema,
  title: z.string().nullable(),
  message: z.string(),
  status: projectObservationStatusSchema.nullable(),
  moduleId: uuidSchema.nullable(),
  moduleName: z.string().nullable(),
  date: z.iso.date(),
  /** Registro de activación del proyecto (Hito 0): `date` es la fecha del Hito 0, corregible por Gerencia/PMO (`projects:manage`) desde la bitácora. */
  isHito0: z.boolean(),
  /** Entrega/tarea a la que se refiere un registro automático (`cambio_proyecto`) — su historial. */
  deliveryId: uuidSchema.nullable(),
  taskId: uuidSchema.nullable(),
  authorUserId: uuidSchema,
  authorName: z.string(),
  createdAt: isoDateTimeSchema,
  /** true para el autor, o para quien puede resolver (`canResolve`) — nunca para `cambio_proyecto`, que nadie edita. */
  canEdit: z.boolean(),
  /** true solo para el autor, y solo dentro de la ventana de borrado — ver `PROJECT_OBSERVATION_DELETE_WINDOW_MS`. */
  canDelete: z.boolean(),
  /** true si es líder de este proyecto, PMO o admin: puede aprobar/rechazar/cerrar/reabrir desde la bitácora. */
  canResolve: z.boolean(),
});
export type ProjectObservation = z.infer<typeof projectObservationSchema>;

/** Estado de un tramo de pago del proyecto ("Facturación" del portal cliente) — independiente del estado de facturación de soporte. */
export const PROJECT_PAYMENT_STATUSES = ['pending', 'invoiced', 'paid'] as const;
export const projectPaymentStatusSchema = z.enum(PROJECT_PAYMENT_STATUSES);
export type ProjectPaymentStatus = z.infer<typeof projectPaymentStatusSchema>;

export const PROJECT_PAYMENT_STATUS_LABELS: Readonly<Record<ProjectPaymentStatus, string>> = {
  pending: 'Pendiente',
  invoiced: 'Facturado',
  paid: 'Pagada',
};

export const projectPaymentMilestoneSchema = z.object({
  id: uuidSchema,
  /** p.ej. "Inicio", "Marcha blanca". */
  name: z.string(),
  /** Nulo para tramos que no son un % del contrato (p.ej. "Desvío de horas (extra)"). */
  percent: z.number().nullable(),
  amount: z.number(),
  invoiceNumber: z.string().nullable(),
  issuedAt: z.iso.date().nullable(),
  status: projectPaymentStatusSchema,
  paidAt: z.iso.date().nullable(),
  sortOrder: z.number().int(),
});
export type ProjectPaymentMilestone = z.infer<typeof projectPaymentMilestoneSchema>;

/** Configurar el cronograma de cobro (crear/editar/quitar tramos) es del líder/PMO — igual criterio que `createProjectModuleSchema`. */
export const createProjectPaymentMilestoneSchema = z.object({
  name: nonEmptyTrimmed(120, 'El nombre del tramo'),
  percent: z.coerce.number().min(0).max(100).nullish(),
  amount: z.coerce.number().min(0),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
export type CreateProjectPaymentMilestoneInput = z.infer<typeof createProjectPaymentMilestoneSchema>;

export const updateProjectPaymentMilestoneSchema = createProjectPaymentMilestoneSchema.partial();
export type UpdateProjectPaymentMilestoneInput = z.infer<typeof updateProjectPaymentMilestoneSchema>;

/**
 * Registrar que un tramo ya fue facturado — mismo criterio que
 * `markSupportInvoiceIssuedSchema`: Kora no emite la factura, solo registra
 * folio y fecha. Si es el primer tramo del proyecto y dispara Hito 0,
 * `pauseForManagementApproval` deja el proyecto pendiente de aprobación de
 * Gerencia en vez de activarlo automáticamente — ver `project_billing_settings`.
 */
export const issueProjectPaymentMilestoneInvoiceSchema = z.object({
  folio: nonEmptyTrimmed(50, 'El folio'),
  issuedAt: z.iso.date(),
  attachmentName: z.string().trim().max(255).optional(),
  pauseForManagementApproval: z.boolean().optional(),
});
export type IssueProjectPaymentMilestoneInvoiceInput = z.infer<typeof issueProjectPaymentMilestoneInvoiceSchema>;

export const markProjectPaymentMilestonePaidSchema = z.object({
  paidAt: z.iso.date(),
  attachmentName: z.string().trim().max(255).optional(),
});
export type MarkProjectPaymentMilestonePaidInput = z.infer<typeof markProjectPaymentMilestonePaidSchema>;

/** Gerencia/PMO corrige la fecha del Hito 0 ya registrado — no reabre ni cambia el estado del proyecto. */
export const correctProjectHito0DateSchema = z.object({ date: z.iso.date() });
export type CorrectProjectHito0DateInput = z.infer<typeof correctProjectHito0DateSchema>;

/**
 * Interruptor global de Hito 0 — fila única (`project_billing_settings`).
 * Lo controla Gerencia (`admin`/`pmo`, `projects:manage`); Finanzas
 * (`billing:read`) solo lo ve, informativo.
 */
export const projectBillingSettingsSchema = z.object({
  autoActivateFirstPayment: z.boolean(),
  updatedAt: isoDateTimeSchema.nullable(),
});
export type ProjectBillingSettings = z.infer<typeof projectBillingSettingsSchema>;

export const updateProjectBillingSettingsSchema = z.object({ autoActivateFirstPayment: z.boolean() });
export type UpdateProjectBillingSettingsInput = z.infer<typeof updateProjectBillingSettingsSchema>;

export const projectSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  client: z.object({ id: uuidSchema, companyName: z.string() }).nullable(),
  type: projectTypeSchema,
  salesStage: projectSalesStageSchema.nullable(),
  status: projectStatusSchema,
  phase: projectPhaseSchema.nullable(),
  priority: projectPrioritySchema.nullable(),
  leader: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  soldHours: z.number(),
  usedHours: z.number(),
  /** Colaboradores con una fila en `project_team_members` (personas asignadas a trabajar en el proyecto). */
  assignedMemberCount: z.number().int(),
  /** Suma de `assignedHours` de todos los miembros asignados — "HH Planificación" del proyecto. */
  plannedHours: z.number(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  actualProgress: z.number().int().nullable(),
  supportPlanDescription: z.string().nullable(),
  supportHours: z.number(),
  /** Habilitado por el líder del proyecto/equipo — sin esto, las horas cargadas contra este proyecto no pueden marcarse como horas extra. */
  allowsOvertime: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectDetailSchema = projectSummarySchema.extend({
  developer: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  commercialManager: z.object({ id: uuidSchema, fullName: z.string() }).nullable(),
  /** Contacto principal DE ESTE PROYECTO (v1: `proyecto.id_contacto`) — puede diferir del contacto general del cliente. */
  primaryContact: clientContactSchema.nullable(),
  estimatedDeliveryDate: z.string().nullable(),
  expectedProgress: z.number().int().nullable(),
  overtimeRateUf: z.number(),
  /** Igual criterio que el resto de los flags "puede gestionar" — no basta con `projects:manage`, ver `GetProjectUseCase`. */
  canAuthorizeOvertime: z.boolean(),
  quotationLink: z.string().nullable(),
  contractLink: z.string().nullable(),
  additionalLinks: z.string().nullable(),
  /** Motivo declarado mientras `status = 'on_hold'`. */
  onHoldReason: z.string().nullable(),
  /** Si está activo, el período detenido no debería contar para plazos/desviación — ese cálculo no está implementado todavía. */
  stopsClock: z.boolean(),
  scopeNotes: z.string().nullable(),
  deliveryDocumentation: z.string().nullable(),
  /** Tab "Extras" — Accesos y enlaces. Solo se muestran/editan en la ficha interna, no en el portal cliente. */
  demoLink: z.string().nullable(),
  testEnvironmentLink: z.string().nullable(),
  figmaLink: z.string().nullable(),
  documentationLink: z.string().nullable(),
  /** Tab "Extras" — Datos de impacto en el negocio (antes/después de automatizar), declarados por el líder. */
  impactBeforeHours: z.number().nullable(),
  impactBeforePeople: z.string().nullable(),
  impactBeforeDuration: z.string().nullable(),
  impactBeforeModality: z.string().nullable(),
  impactAfterHours: z.number().nullable(),
  impactAfterPeople: z.string().nullable(),
  impactAfterDuration: z.string().nullable(),
  impactAfterModality: z.string().nullable(),
  /** Tab "Extras" — Métricas QA de la etapa de pruebas, declaradas por el líder. */
  qaTestingStartDate: z.string().nullable(),
  qaTestingEndDate: z.string().nullable(),
  qaEvaluatedModule: z.string().nullable(),
  qaPlannedTests: z.number().int().nullable(),
  qaExecutedTests: z.number().int().nullable(),
  qaFailedTests: z.number().int().nullable(),
  /** "Avance del periodo" del portal cliente — narrativa de logros declarada por el líder, igual criterio que impacto/QA. */
  periodReportDate: z.string().nullable(),
  periodReportAchievements: z.array(z.string()).nullable(),
  /** Fecha de la hora aprobada más reciente del proyecto — "actualizado al" de la tarjeta de horas. `null` si no tiene ninguna. */
  usedHoursUpdatedAt: z.string().nullable(),
  /**
   * Horas aprobadas registradas antes del día del Hito 0 — fase
   * "Prospecto/Cotización" del documento de Leslie. Ya están incluidas en
   * `usedHours` (suman al consumo total, la cotización ya las considera);
   * este campo solo las separa para mostrarlas aparte. Sin Hito 0 todavía,
   * es igual a `usedHours` completo.
   */
  prospectPhaseHours: z.number(),
  /** "Facturación" del portal cliente — cronograma de tramos de pago. */
  paymentMilestones: z.array(projectPaymentMilestoneSchema),
  /** true si Hito 0 quedó pausado esperando que Gerencia active el proyecto a mano. */
  pendingManagementApproval: z.boolean(),
  /** Fecha del Hito 0 (kickoff) — `null` si el proyecto nunca se activó. Editable por Gerencia/PMO. */
  hito0At: isoDateTimeSchema.nullable(),
  /** Qué disparó el Hito 0 — `null` junto con `hito0At`. */
  hito0Source: projectHito0SourceSchema.nullable(),
  /** Motivo/referencia del Hito 0 manual — solo cuando `hito0Source === 'manual'`. */
  hito0Reason: z.string().nullable(),
  teams: z.array(projectTeamSchema),
  members: z.array(projectTeamMemberSchema),
  observations: z.array(projectObservationSchema),
  modules: z.array(projectModuleSchema),
  legacyId: z.number().int().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** Equipo asignado desde la creación del proyecto — ver `project_teams` (v1: `equipo_proyecto`). */
export const createProjectTeamAssignmentSchema = z.object({
  teamId: uuidSchema,
  leaderUserId: uuidSchema.nullish(),
  /** Tope de colaboradores del equipo en el proyecto. Vacío = sin tope (no 0: `coerce` convertiría '' en 0). */
  memberCount: z.preprocess(
    (value) => (value === '' ? null : value),
    z.coerce.number().int().min(1, 'El N° de colaboradores debe ser al menos 1 (o déjalo vacío).').nullish(),
  ),
  assignedHours: z.coerce.number().min(0).nullish(),
});
export type CreateProjectTeamAssignmentInput = z.infer<typeof createProjectTeamAssignmentSchema>;

export const createProjectSchema = z
  .object({
    name: nonEmptyTrimmed(300, 'El nombre del proyecto'),
    clientId: uuidSchema.nullish(),
    type: projectTypeSchema,
    salesStage: projectSalesStageSchema.nullish(),
    /** Subconjunto de `PROJECT_STATUSES` con sentido al crear — igual que "Estado" en la v1 (Activo/No iniciado/Detenido). */
    status: z.enum(['draft', 'active', 'on_hold']).nullish(),
    phase: projectPhaseSchema.nullish(),
    priority: projectPrioritySchema.nullish(),
    leaderUserId: uuidSchema.nullish(),
    developerUserId: uuidSchema.nullish(),
    commercialManagerUserId: uuidSchema.nullish(),
    startDate: z.iso.date().nullish(),
    estimatedDeliveryDate: z.iso.date().nullish(),
    soldHours: z.coerce.number().min(0).default(0),
    supportPlanDescription: z.string().trim().max(2000).optional(),
    supportHours: z.coerce.number().min(0).default(0),
    quotationLink: z.string().trim().max(500).optional(),
    contractLink: z.string().trim().max(500).optional(),
    additionalLinks: z.string().trim().max(500).optional(),
    teams: z.array(createProjectTeamAssignmentSchema).max(20).default([]),
    /**
     * Contrato de soporte completo — solo para `type='support'`. Un proyecto
     * de soporte creado desde cero (sin un proyecto de desarrollo terminado
     * previo que consolidar) configura aquí mismo su contrato: se crea el
     * proyecto y su `support_plans` juntos, enlazados directamente (no vía
     * `support_plan_projects`, que es solo para consolidar proyectos ya
     * existentes — ver `CreateSupportPlanUseCase`).
     *
     * Enums duplicados a propósito como literales (en vez de importar desde
     * `tickets/support-plan.contract.ts`): ese archivo ya importa
     * `projectStatusSchema` desde este mismo archivo, así que importar en
     * sentido contrario crearía un ciclo dentro de `@kora/contracts`.
     */
    supportPlanType: z.enum(['monthly', 'bundle', 'on_demand']).optional(),
    /** Override del contacto principal del cliente para este contrato — mismo campo que `CreateSupportPlanInput.primaryContactId`, duplicado aquí por el mismo motivo que los demás `support*` (evitar el ciclo con `tickets/support-plan.contract.ts`). */
    primaryContactId: uuidSchema.nullish(),
    supportSurplusPolicy: z.enum(['accumulate', 'expire']).optional(),
    supportPlanValueUf: z.coerce.number().min(0).optional(),
    supportExtraHourValueUf: z.coerce.number().min(0).optional(),
    /** Moneda del contrato — gobierna los dos valores de arriba pese al sufijo heredado. Mismo enum duplicado que `supportPlanType` y por el mismo motivo (evitar el ciclo con `tickets/support-plan.contract.ts`). */
    supportCurrency: z.enum(['UF', 'CLP', 'USD']).optional(),
    supportDueDayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
    supportTargetHoursCritical: z.coerce.number().min(0).optional(),
    supportTargetHoursHigh: z.coerce.number().min(0).optional(),
    supportTargetHoursMedium: z.coerce.number().min(0).optional(),
    supportTargetHoursLow: z.coerce.number().min(0).optional(),
  })
  .refine((data) => data.type !== 'development' || data.salesStage, {
    message: 'Los proyectos de desarrollo requieren una etapa comercial.',
    path: ['salesStage'],
  })
  /** Desde que se crea, al proyecto de desarrollo se le pueden cargar horas — necesita un líder que las apruebe. */
  .refine((data) => data.type !== 'development' || data.leaderUserId, {
    message: 'Selecciona el líder a cargo del proyecto.',
    path: ['leaderUserId'],
  })
  .refine(
    (data) =>
      data.type !== 'development' ||
      (data.salesStage !== 'prospect' && data.salesStage !== 'quoted') ||
      data.commercialManagerUserId,
    {
      message: 'Selecciona el responsable comercial del proyecto.',
      path: ['commercialManagerUserId'],
    },
  )
  .refine((data) => data.type !== 'support' || data.supportPlanType, {
    message: 'Los proyectos de soporte requieren un tipo de contrato.',
    path: ['supportPlanType'],
  });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre del proyecto').optional(),
  clientId: uuidSchema.nullish(),
  /** Contacto principal DE ESTE PROYECTO (v1: `proyecto.id_contacto`) — puede diferir del contacto del cliente. Antes solo se fijaba al crear un contrato de soporte (`SupportPlan.primaryContactId`, un concepto distinto); esto lo habilita para cualquier proyecto. */
  primaryContactId: uuidSchema.nullish(),
  salesStage: projectSalesStageSchema.nullish(),
  phase: projectPhaseSchema.nullish(),
  priority: projectPrioritySchema.nullish(),
  leaderUserId: uuidSchema.nullish(),
  developerUserId: uuidSchema.nullish(),
  commercialManagerUserId: uuidSchema.nullish(),
  startDate: z.iso.date().nullish(),
  endDate: z.iso.date().nullish(),
  estimatedDeliveryDate: z.iso.date().nullish(),
  soldHours: z.coerce.number().min(0).optional(),
  expectedProgress: z.coerce.number().int().min(0).max(100).nullish(),
  actualProgress: z.coerce.number().int().min(0).max(100).nullish(),
  supportPlanDescription: z.string().trim().max(2000).optional(),
  supportHours: z.coerce.number().min(0).optional(),
  quotationLink: z.string().trim().max(500).optional(),
  contractLink: z.string().trim().max(500).optional(),
  onHoldReason: z.string().trim().max(2000).nullish(),
  stopsClock: z.boolean().optional(),
  scopeNotes: z.string().trim().max(2000).nullish(),
  deliveryDocumentation: z.string().trim().max(500).nullish(),
  demoLink: z.string().trim().max(500).nullish(),
  testEnvironmentLink: z.string().trim().max(500).nullish(),
  figmaLink: z.string().trim().max(500).nullish(),
  documentationLink: z.string().trim().max(500).nullish(),
  impactBeforeHours: z.coerce.number().min(0).nullish(),
  impactBeforePeople: z.string().trim().max(500).nullish(),
  impactBeforeDuration: z.string().trim().max(500).nullish(),
  impactBeforeModality: z.string().trim().max(500).nullish(),
  impactAfterHours: z.coerce.number().min(0).nullish(),
  impactAfterPeople: z.string().trim().max(500).nullish(),
  impactAfterDuration: z.string().trim().max(500).nullish(),
  impactAfterModality: z.string().trim().max(500).nullish(),
  qaTestingStartDate: z.iso.date().nullish(),
  qaTestingEndDate: z.iso.date().nullish(),
  qaEvaluatedModule: z.string().trim().max(300).nullish(),
  qaPlannedTests: z.coerce.number().int().min(0).nullish(),
  qaExecutedTests: z.coerce.number().int().min(0).nullish(),
  qaFailedTests: z.coerce.number().int().min(0).nullish(),
  periodReportDate: z.iso.date().nullish(),
  periodReportAchievements: z.array(z.string().trim().max(500)).max(20).nullish(),
  /** Agregar/quitar equipos y editar líder/colaboradores/horas de los ya asignados — la lista reemplaza a la actual. */
  teams: z.array(createProjectTeamAssignmentSchema).max(20).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * Subconjunto de `updateProjectSchema` para la pestaña "Extras" (accesos,
 * impacto de negocio, métricas QA) — endpoint propio, no `projects:manage`:
 * mismo criterio que `setProjectOvertimeAuthorizationSchema`, el líder de
 * proyecto/equipo también puede editar estos campos de bajo riesgo en su
 * propio proyecto, sin abrir el resto de `PATCH /projects/:id` (cliente,
 * líder, horas vendidas, equipos).
 */
export const updateProjectExtrasSchema = updateProjectSchema.pick({
  demoLink: true,
  testEnvironmentLink: true,
  figmaLink: true,
  documentationLink: true,
  impactBeforeHours: true,
  impactBeforePeople: true,
  impactBeforeDuration: true,
  impactBeforeModality: true,
  impactAfterHours: true,
  impactAfterPeople: true,
  impactAfterDuration: true,
  impactAfterModality: true,
  qaTestingStartDate: true,
  qaTestingEndDate: true,
  qaEvaluatedModule: true,
  qaPlannedTests: true,
  qaExecutedTests: true,
  qaFailedTests: true,
  periodReportDate: true,
  periodReportAchievements: true,
});
export type UpdateProjectExtrasInput = z.infer<typeof updateProjectExtrasSchema>;

export const changeProjectStatusSchema = z.object({
  status: projectStatusSchema,
  /**
   * Obligatorio solo para el Hito 0 manual: activar a mano (sin factura) un
   * proyecto `development`/`approved` que estaba `draft` — ver
   * `ChangeProjectStatusUseCase`. Se ignora en cualquier otra transición.
   */
  reason: z.string().trim().max(2000).optional(),
});
export type ChangeProjectStatusInput = z.infer<typeof changeProjectStatusSchema>;

export const setProjectOvertimeAuthorizationSchema = z.object({ allowsOvertime: z.boolean() });
export type SetProjectOvertimeAuthorizationInput = z.infer<typeof setProjectOvertimeAuthorizationSchema>;

export const assignProjectTeamMemberSchema = z.object({
  teamMemberId: uuidSchema,
  activity: z.string().trim().max(500).optional(),
  assignedHours: z.coerce.number().min(0).default(0),
});
export type AssignProjectTeamMemberInput = z.infer<typeof assignProjectTeamMemberSchema>;

export const updateProjectTeamMemberSchema = z.object({
  activity: z.string().trim().max(500).nullish(),
  assignedHours: z.coerce.number().min(0).optional(),
});
export type UpdateProjectTeamMemberInput = z.infer<typeof updateProjectTeamMemberSchema>;

export const addProjectObservationSchema = z.object({
  /** El compositor rápido de la pestaña Observaciones no elige tipo: queda 'observacion'. */
  type: projectObservationTypeSchema.default('observacion'),
  title: z.string().trim().max(200).optional(),
  message: nonEmptyTrimmed(4000, 'El mensaje'),
  date: z.iso.date().optional(),
  moduleId: uuidSchema.nullish(),
});
export type AddProjectObservationInput = z.infer<typeof addProjectObservationSchema>;

export const updateProjectObservationSchema = z.object({
  message: nonEmptyTrimmed(4000, 'El mensaje'),
});
export type UpdateProjectObservationInput = z.infer<typeof updateProjectObservationSchema>;

/** Aprobar/rechazar/cerrar/reabrir — transición de `status` sin tocar el mensaje. Ver `PROJECT_OBSERVATION_ALLOWED_TRANSITIONS`. */
export const resolveProjectObservationSchema = z.object({
  status: projectObservationStatusSchema,
});
export type ResolveProjectObservationInput = z.infer<typeof resolveProjectObservationSchema>;

export const projectSortFieldSchema = z.enum([
  'name',
  'status',
  'priority',
  'createdAt',
  'client',
  'leader',
  'startDate',
  'endDate',
  'progress',
  'soldHours',
  'usedHours',
  'remainingHours',
  'supportHours',
  'supportPlan',
  'deviationHours',
]);
export type ProjectSortField = z.infer<typeof projectSortFieldSchema>;

export const listProjectsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  type: projectTypeSchema.optional(),
  status: arrayQueryParam(projectStatusSchema),
  phase: arrayQueryParam(projectPhaseSchema),
  /** Acepta id o slug: la ficha de cliente filtra por el `clientId` de la URL, que ahora es el slug del cliente — se resuelve a UUID en `ListProjectsUseCase`. */
  clientId: z.string().optional(),
  leaderUserId: arrayQueryParam(uuidSchema),
  /** Filtra a los proyectos donde el usuario indicado participa (líder, desarrollador o miembro). */
  assignedToUserId: uuidSchema.optional(),
  /** Filtra a los proyectos con al menos un miembro de este equipo asignado. Acepta id o slug — ver `clientId`. */
  teamId: z.string().optional(),
  sortField: projectSortFieldSchema.default('createdAt'),
  sortDirection: sortDirectionSchema.default('desc'),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const listProjectsResponseSchema = pageSchema(projectSummarySchema);
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
