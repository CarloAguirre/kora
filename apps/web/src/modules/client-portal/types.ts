import type { SupportPlanCurrency, SupportPlanType } from '@kora/contracts';

/**
 * Tipos del portal de cliente.
 *
 * No son un alias 1:1 de ningún contrato de `@kora/contracts`: son la forma
 * que ya consumen las vistas del portal, y `adapters/*.adapter.ts` traduce
 * los contratos reales (`ProjectDetail`, `SupportPlanWithInvoices`, etc.)
 * hacia acá — ver docs/DECISION-PORTAL-CLIENTE.md para el detalle de qué
 * vive en cada capa y qué huecos de datos reales quedan documentados en cada
 * adaptador.
 */

export interface ClientCompanyInfo {
  readonly name: string;
  readonly contactName: string;
  readonly contactPosition: string;
}

/**
 * Estado del proyecto para el cliente: el ciclo de vida real (`ProjectStatus`
 * en `@kora/contracts`) más la etapa comercial — de ahí que sea un tipo aparte
 * y no un alias de `ProjectStatus`. `prospect`/`quoted` vienen de la etapa
 * comercial (`salesStage`) y `not_started` de `status: 'draft'`: sin ellos,
 * un proyecto aún no vendido o no iniciado se le mostraba al cliente "Activo".
 */
export type ClientProjectHealth = 'prospect' | 'quoted' | 'not_started' | 'active' | 'on_hold' | 'finished' | 'cancelled';

export interface ClientProjectRow {
  readonly id: string;
  readonly slug?: string | null;
  readonly name: string;
  /** Líder del proyecto (`ProjectSummary.leader`) — columna "Líder Kabeli". */
  readonly leaderName: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly health: ClientProjectHealth;
  readonly stageLabel: string;
  /** Avance real (`progress.actual`); `null` = sin plan cargado. */
  readonly progressPercent: number | null;
}

export interface ClientSupportContractRow {
  readonly id: string;
  readonly slug?: string | null;
  readonly name: string;
  readonly planType: SupportPlanType;
  readonly kabeliOwnerName: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly contractedHours: number | null;
  readonly consumedHours: number | null;
  readonly hourValueUf: number | null;
  readonly currency: SupportPlanCurrency;
  readonly billingState: string;
  readonly contractStatus: 'active' | 'finished';
}

/**
 * Ficha de contrato de soporte ("Detalle contrato de soporte" del Figma, node
 * 9007:8445) — la pieza que `docs/DECISION-PORTAL-CLIENTE.md` marcaba como no
 * construida: el nombre de un contrato en la tabla de Soporte era texto
 * plano, no un enlace a esta ficha con la lista de tickets del contrato.
 */
export type SupportTicketWorkflowStatus = 'pending' | 'in_progress' | 'closed';
export type SupportTicketBillingStatus = 'to_invoice' | 'invoiced' | 'pending_invoice';
export type SupportTicketPriority = 'low' | 'medium' | 'high';
/** "IN" (Incidente) vs "ME" (Mejora) — el prefijo del código del ticket en el Figma; "OP" (Operativo) se agregó después. */
export type SupportTicketType = 'incident' | 'improvement' | 'operational';

export interface SupportTicketHistoryEntry {
  readonly date: string;
  readonly label: string;
  /** Sub-items con viñeta bajo el label (Figma: "Edición de ticket:" seguido de
   *  "Reasignado a…" / "Cambio de prioridad: …"). */
  readonly details?: readonly string[];
}

export interface SupportTicket {
  /** Id real del ticket — no se muestra, solo para pedir su detalle completo al seleccionarlo. */
  readonly id: string;
  readonly code: string;
  readonly type: SupportTicketType;
  readonly title: string;
  readonly workflowStatus: SupportTicketWorkflowStatus;
  readonly billingStatus: SupportTicketBillingStatus;
  readonly responsibleName: string;
  readonly reportDate: string;
  readonly solutionDate: string | null;
  readonly estimatedHours: number;
  readonly usedHours: number;
  readonly priority: SupportTicketPriority;
  /** Texto tal cual del Figma, p.ej. "06:53:18/8hr" (tiempo usado del SLA / tope). */
  readonly sla: string;
  readonly description: string;
  readonly evidenceFiles: readonly string[];
  readonly appliedSolution: string | null;
  readonly history: readonly SupportTicketHistoryEntry[];
}

/** Proyecto de desarrollo cubierto por el contrato — una pestaña de "Proyectos del consolidado" cuando `scope === 'consolidated'`. */
export interface SupportContractLinkedProject {
  readonly id: string;
  readonly name: string;
}

export interface SupportContractDetail {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'finished';
  readonly company: ClientCompanyInfo;
  /** `single` = un proyecto de desarrollo cubierto (Figma node 9007:8445); `consolidated` = varios, con pestaña por proyecto (Figma node 9007:8170). */
  readonly scope: 'single' | 'consolidated';
  readonly linkedProjects: readonly SupportContractLinkedProject[];
  /** Título largo de la tarjeta en `scope: 'single'`, p.ej. "Proyecto del contrato: App Mobile Residentes con asistente IA" — el consolidado no lo muestra, usa las pestañas. */
  readonly description: string | null;
  readonly planType: SupportPlanType;
  readonly kabeliOwnerName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly contractedHours: number;
  readonly consumedHours: number;
  readonly currentHourValueUf: number;
  readonly extraHourValueUf: number;
  readonly currency: SupportPlanCurrency;
  /** Rango del selector de fechas sobre la lista de tickets. */
  readonly rangeStartDate: string;
  readonly rangeEndDate: string;
  readonly tickets: readonly SupportTicket[];
}

/**
 * Sub-etapas dentro de una fase del roadmap del cliente ("Hoja de ruta" del
 * Figma) — NO es el mismo concepto que `ProjectPhase` de `@kora/contracts`:
 * ese describe la etapa vigente de TODO el proyecto, mientras que esto es el
 * mini-pipeline que recorre cada fase individual (p.ej. "Fase 2" pasa por
 * Levantamiento → Desarrollo → Pruebas → Marcha blanca → Finalizado).
 * Se mantiene como tipo propio para no forzar un calce que no existe.
 */
export const ROADMAP_STEPS = ['discovery', 'development', 'production', 'pilot', 'finished'] as const;
export type RoadmapStep = (typeof ROADMAP_STEPS)[number];

export const ROADMAP_STEP_LABELS: Readonly<Record<RoadmapStep, string>> = {
  discovery: 'Levantamiento',
  development: 'Desarrollo',
  production: 'Pruebas',
  pilot: 'Marcha blanca',
  finished: 'Finalizado',
};

export interface ClientRoadmapPhase {
  readonly name: string;
  readonly status: 'finished' | 'in_progress' | 'upcoming';
  readonly startDate: string;
  readonly endDate: string;
  /** Paso activo dentro de la fase (solo tiene sentido cuando `status === 'in_progress'`). */
  readonly currentStep: RoadmapStep | null;
  /** Los 4 meses que cubre la barra de esta fase (Figma: "Mar/Abr/May/Jun" para la Fase 1). */
  readonly months: readonly [string, string, string, string];
  /** Posición (0-100) del marcador de avance esperado dentro de esta fase —
   *  solo la fase `in_progress` lo muestra (Figma node 9663:24568: una línea
   *  roja sin etiqueta "HOY", solo visual — el texto de apoyo la describe como
   *  "el avance esperado a hoy", no como la fecha de hoy). */
  readonly expectedProgressPercent?: number;
}

/**
 * Roadmap por fases ("Roadmap por Fases" del Figma, node 9669:31017) — un
 * acordeón con una tarjeta por fase del proyecto (no por módulo fijo): cada
 * fase agrupa sus propias tareas por ROL de equipo (cantidad variable, no
 * siempre las mismas 4), sus entregas planificadas y las entradas de
 * `ClientBitacoraEntry` relacionadas a esa fase. Reemplaza al Gantt anterior
 * de 3 módulos fijos × 4 tareas fijas (`ProjectGantt`/`GanttModule`), que ya
 * no calzaba con el Figma actualizado.
 */
export type PhaseRoadmapRole = 'dev' | 'qa' | 'ia' | 'ux' | 'rpa';

export const PHASE_ROADMAP_ROLE_LABELS: Readonly<Record<PhaseRoadmapRole, string>> = {
  dev: 'DEV',
  qa: 'QA',
  ia: 'IA',
  ux: 'UX',
  rpa: 'RPA',
};

/** Colores por rol tomados del Figma (node 9669:31017, fila de leyenda). */
export const PHASE_ROADMAP_ROLE_COLORS: Readonly<Record<PhaseRoadmapRole, string>> = {
  dev: '#2e9e52',
  qa: '#6c63e8',
  ia: '#4c7ef3',
  ux: '#b8790e',
  rpa: '#d5504b',
};

/** Ámbito de la tarea — base del % por ámbito en "Resumen de avance" de la fase (mismo criterio que `PROJECT_MODULE_TASK_SCOPES` del módulo interno de proyectos). */
export type PhaseRoadmapTaskScope = 'diseno' | 'desarrollo' | 'qa' | 'revision_cliente';

export const PHASE_ROADMAP_TASK_SCOPES: readonly PhaseRoadmapTaskScope[] = ['diseno', 'desarrollo', 'qa', 'revision_cliente'];

export const PHASE_ROADMAP_TASK_SCOPE_LABELS: Readonly<Record<PhaseRoadmapTaskScope, string>> = {
  diseno: 'Diseño',
  desarrollo: 'Desarrollo',
  qa: 'QA Funcional',
  revision_cliente: 'Rev. Cliente',
};

/**
 * Tramo de trabajo de un rol dentro de la fase. Las fechas son ISO
 * (`YYYY-MM-DD`) y el Gantt las posiciona como % del rango visible: el estado
 * (terminada / en curso / futura) se deriva de ellas contra hoy, igual que en
 * `ProjectModulesCard` del módulo interno, así que no se guarda aparte.
 */
export interface PhaseRoadmapTask {
  /** Id del tramo (`ProjectModuleSegment`) — el Roadmap interno lo usa para abrir su detalle/edición. */
  readonly id?: string;
  readonly role: PhaseRoadmapRole;
  readonly scope: PhaseRoadmapTaskScope;
  /** Descripción corta bajo el código de rol, p.ej. "Diseño y levantamiento". */
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
}

export type PhaseRoadmapDeliveryState = 'delivered' | 'committed' | 'delayed';

export interface PhaseRoadmapDelivery {
  readonly id?: string;
  readonly label: string;
  /** ISO `YYYY-MM-DD`. */
  readonly date: string;
  readonly state: PhaseRoadmapDeliveryState;
}

export type PhaseRoadmapTaskItemState = 'done' | 'upcoming' | 'delayed';

export interface PhaseRoadmapTaskItem {
  readonly id?: string;
  readonly label: string;
  /** ISO `YYYY-MM-DD`. */
  readonly date: string;
  readonly state: PhaseRoadmapTaskItemState;
  /** Ámbito de la tarea — conecta los chips de "Resumen de avance" (antes solo decorativos) con las tareas reales de la fase. */
  readonly scope: PhaseRoadmapTaskScope;
  /** La tarea "actual"/en foco de la fase se resalta con borde y fondo (Figma: "Casos de prueba conciliación"). */
  readonly highlighted?: boolean;
}

export interface PhaseRoadmapPhase {
  readonly id: string;
  readonly badge: string;
  readonly name: string;
  readonly status: 'finished' | 'in_progress' | 'upcoming';
  /** "1 incidente" / "1 atraso" — badge rojo junto al chevron; `null` si la fase no tiene alertas. */
  readonly alertLabel: string | null;
  readonly tasks: readonly PhaseRoadmapTask[];
  readonly deliveries: readonly PhaseRoadmapDelivery[];
  readonly taskItems: readonly PhaseRoadmapTaskItem[];
  /** % de avance por ámbito ponderado por HH (`module.progress.scopes`, calculado en el backend) —
   *  `null` = ámbito sin tareas. Sin este dato, los chips caen al conteo de tareas aprobadas. */
  readonly scopeProgress?: Readonly<Record<PhaseRoadmapTaskScope, number | null>>;
  readonly relatedBitacora: readonly ClientBitacoraEntry[];
}

export interface ProjectPhaseRoadmap {
  readonly phaseCount: number;
  readonly teamSegmentCount: number;
  readonly plannedDeliveryCount: number;
  /** Rango visible por defecto del Gantt, ISO `YYYY-MM-DD` (editable desde el filtro "Rango visible"). */
  readonly rangeStartDate: string;
  readonly rangeEndDate: string;
  readonly phases: readonly PhaseRoadmapPhase[];
}

/**
 * Bitácora del proyecto ("Bitácora" del Figma, node 9663:24685) — reemplaza
 * las dos secciones separadas "Hitos y aprobaciones" y "Puntos de atención e
 * incidentes": ahora es un solo feed cronológico donde cada entrada trae su
 * propia etiqueta de fase, en vez de vivir agrupada bajo una sola fase activa
 * (`milestonesCaption` ya no aplica a nada).
 */
export type ClientBitacoraEntryKind = 'completed' | 'marked' | 'attention' | 'milestone' | 'pending';

/** Tono del badge de estado de una entrada de bitácora — es un badge plano
 *  (fondo + texto, sin punto), NO el mismo componente que `StatusPill`, así
 *  que tiene su propio vocabulario de tonos en vez de reusar `StatusPillTone`. */
export type ClientBitacoraStatusTone = 'success' | 'warning' | 'info' | 'danger';

export interface ClientBitacoraEntry {
  readonly id: string;
  readonly kind: ClientBitacoraEntryKind;
  readonly title: string;
  readonly registeredByName: string;
  /** Fecha y hora tal cual el Figma, p.ej. "02-09-2026, 10:20 a.m.". */
  readonly registeredAt: string;
  /** p.ej. "Fase 1 - Módulo Financiero" — `null` cuando la entrada no está atada a una fase (Figma: "Seguimiento general del proyecto"). */
  readonly phaseTag: string | null;
  readonly description: string;
  readonly statusLabel: string;
  readonly statusTone: ClientBitacoraStatusTone;
  /** Cajita de confirmación bajo la descripción (Figma: "✓ Aprobado por Camila Reyes el 15-06-2026 09:15") — no todas las entradas la tienen. */
  readonly secondaryNote?: string;
}

/**
 * Facturación del proyecto ("Facturación" del Figma, node 9663:24480) —
 * distinto del billing de contratos de soporte (`ClientSupportContractRow`):
 * esto es el cronograma de pago DEL PROYECTO, no de un plan de soporte.
 */
export interface ClientBillingScheduleRow {
  readonly tramo: string;
  readonly percent: number;
  readonly amount: number;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  readonly status: 'paid' | 'pending';
  readonly paymentDate: string | null;
}

export interface ClientProjectBilling {
  /** Moneda del contrato del proyecto — la de todos sus tramos. */
  readonly currency: 'UF' | 'CLP' | 'USD';
  readonly totalAmount: number;
  readonly paid: { readonly amount: number; readonly percent: number };
  readonly invoicedPendingCollection: { readonly amount: number; readonly percent: number };
  readonly pendingToInvoice: { readonly amount: number; readonly percent: number };
  readonly schedule: readonly ClientBillingScheduleRow[];
}

/** "Accesos y enlaces" — declarados en la pestaña "Extras" de la ficha interna
 *  (`demoLink`/`testEnvironmentLink`/`figmaLink`/`documentationLink` de
 *  `ProjectDetail`); `null` cuando el proyecto no tiene ese link configurado,
 *  así la vista cliente solo muestra las tarjetas que sí tienen destino. */
export interface ClientAccessLinks {
  readonly demo: string | null;
  readonly testEnvironment: string | null;
  readonly figma: string | null;
  readonly documentation: string | null;
}

export interface ClientProjectDetail {
  readonly id: string;
  readonly slug?: string | null;
  readonly name: string;
  readonly health: ClientProjectHealth;
  readonly tag: string;
  readonly company: ClientCompanyInfo;
  readonly kabeliOwnerName: string;
  /** Contacto de ESTE proyecto — puede diferir del contacto general de la
   *  empresa (`company.contactName`), igual que `primaryContact` en
   *  `ProjectDetail` de `@kora/contracts`. */
  readonly clientContactName: string;
  readonly clientContactPosition: string;
  readonly startDate: string;
  readonly estimatedHours: number;
  readonly hoursDeviation: number;
  readonly usedHoursToDate: number;
  readonly usedHoursUpdatedAt: string;
  /** Última acción del líder (PM) sobre el proyecto, ya formateada ("05-10-2026, 02:30 p. m."). `null` si no hay registro. */
  readonly lastUpdatedAt: string | null;
  /** `null` (ambos) = el proyecto todavía no tiene plan de tareas cargado. */
  readonly progressActualPercent: number | null;
  readonly progressExpectedPercent: number | null;
  readonly endDate: string;
  readonly daysRemaining: number;
  readonly billing: ClientProjectBilling;
  readonly roadmap: readonly ClientRoadmapPhase[];
  readonly phaseRoadmap: ProjectPhaseRoadmap;
  readonly bitacora: readonly ClientBitacoraEntry[];
  readonly accessLinks: ClientAccessLinks;
  /** Ver "Impacto en el negocio" del Figma — antes/después de automatizar. */
  readonly businessImpact: {
    readonly before: { readonly totalProcessHours: number; readonly peopleInvolved: number; readonly cycleDays: number; readonly modality: string };
    readonly after: { readonly totalProcessHours: number; readonly peopleInvolved: number; readonly cycleDays: number; readonly modality: string };
    readonly reductionPercent: number;
  };
  /** Métricas de QA de la etapa vigente — null si el proyecto no está en QA. */
  readonly qaMetrics: {
    readonly stageLabel: string;
    /** Caption del encabezado, p.ej. "300 pruebas planificadas para el módulo de tickets". */
    readonly caption: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly planned: number;
    readonly executed: number;
    readonly withErrors: number;
    readonly remaining: number;
  } | null;
}
