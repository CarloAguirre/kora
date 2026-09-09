import type { SupportPlanType } from '@kora/contracts';

/**
 * Tipos del portal de cliente.
 *
 * TODO(portal-cliente): estos tipos describen la forma que HOY tienen los
 * datos de ejemplo en `mocks/client-portal.mocks.ts`, no un contrato real de
 * `@kora/contracts`. No existe todavía un endpoint que agregue "los proyectos
 * y contratos de soporte de MI empresa" — ver docs/DECISION-PORTAL-CLIENTE.md
 * para el porqué y lo que falta para conectarlos a datos reales.
 */

export interface ClientCompanyInfo {
  readonly name: string;
  readonly contactName: string;
  readonly contactPosition: string;
}

/**
 * Estado visual del proyecto para el cliente: combina el ciclo de vida real
 * (`ProjectStatus` en `@kora/contracts`) con una señal de riesgo/salud que hoy
 * no existe como campo propio en el proyecto — de ahí que sea un tipo aparte
 * y no un alias de `ProjectStatus`.
 */
export type ClientProjectHealth = 'active' | 'at_risk' | 'finished';

export interface ClientProjectRow {
  readonly id: string;
  readonly name: string;
  readonly phaseCount: number;
  readonly tag: string;
  readonly kabeliOwnerName: string;
  readonly clientOwnerName: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly health: ClientProjectHealth;
  readonly stageLabel: string;
  readonly stageProgressPercent: number;
}

export interface ClientSupportContractRow {
  readonly id: string;
  readonly name: string;
  readonly planType: SupportPlanType;
  readonly kabeliOwnerName: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly contractedHours: number | null;
  readonly consumedHours: number | null;
  readonly hourValueUf: number | null;
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
/** "IN" (Incidente) vs "ME" (Mejora) — el prefijo del código del ticket en el Figma. */
export type SupportTicketType = 'incident' | 'improvement';

export interface SupportTicketHistoryEntry {
  readonly date: string;
  readonly label: string;
  /** Sub-items con viñeta bajo el label (Figma: "Edición de ticket:" seguido de
   *  "Reasignado a…" / "Cambio de prioridad: …"). */
  readonly details?: readonly string[];
}

export interface SupportTicket {
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

export interface SupportContractDetail {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'finished';
  readonly company: ClientCompanyInfo;
  /** Título largo de la tarjeta, p.ej. "Proyecto del contrato: App Mobile Residentes con asistente IA". */
  readonly description: string;
  readonly planType: SupportPlanType;
  readonly kabeliOwnerName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly contractedHours: number;
  readonly consumedHours: number;
  readonly currentHourValueUf: number;
  readonly extraHourValueUf: number;
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
 * Levantamiento → Desarrollo → Producción → Marcha blanca → Finalizado).
 * Se mantiene como tipo propio para no forzar un calce que no existe.
 */
export const ROADMAP_STEPS = ['discovery', 'development', 'production', 'pilot', 'finished'] as const;
export type RoadmapStep = (typeof ROADMAP_STEPS)[number];

export const ROADMAP_STEP_LABELS: Readonly<Record<RoadmapStep, string>> = {
  discovery: 'Levantamiento',
  development: 'Desarrollo',
  production: 'Producción',
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
  /** Posición (0-100) de la línea "HOY" dentro de esta fase — solo la fase `in_progress` la muestra. */
  readonly todayMarkerPercent?: number;
}

/**
 * Roadmap semanal por módulo ("Roadmap del proyecto" del Figma, node 9203:2583)
 * — un Gantt simplificado: un módulo por fase del proyecto, con 4 tareas fijas
 * cada uno (Diseño, Desarrollo, QA Funcional, Revisión y Aprobación Cliente).
 * `startPercent`/`widthPercent` ubican la barra de la tarea dentro del eje de
 * tiempo completo (0-100, cubre `GANTT_MONTHS`) — son aproximaciones visuales
 * de ejemplo, no un cálculo real a partir de fechas.
 */
export type GanttTaskKey = 'design' | 'development' | 'qa' | 'approval';
export type GanttTaskState = 'done' | 'in_progress' | 'upcoming';

export const GANTT_TASK_LABELS: Readonly<Record<GanttTaskKey, string>> = {
  design: 'Diseño (UX-UI)',
  development: 'Desarrollo',
  qa: 'QA Funcional',
  approval: 'Rev. y Apro. Cliente',
};

/** Nombre largo — solo la leyenda al pie del Gantt lo usa; las filas usan `GANTT_TASK_LABELS`. */
export const GANTT_TASK_LEGEND_LABELS: Readonly<Record<GanttTaskKey, string>> = {
  design: 'Diseño (UX-UI)',
  development: 'Desarrollo',
  qa: 'QA Funcional',
  approval: 'Revisión y Aprobación Cliente',
};

export const GANTT_TASK_COLORS: Readonly<Record<GanttTaskKey, string>> = {
  design: '#2e9e52',
  development: '#4c7ef3',
  qa: '#b8790e',
  approval: '#6c63e8',
};

export interface GanttTask {
  readonly key: GanttTaskKey;
  readonly state: GanttTaskState;
  readonly startPercent: number;
  readonly widthPercent: number;
  /** Texto dentro (o junto a) la barra: "✓", "✓ OK", "En curso", "Próximo", "Pendiente", "Estimado". */
  readonly stateLabel: string;
}

export interface GanttModule {
  readonly badge: string;
  readonly name: string;
  readonly status: 'finished' | 'in_progress' | 'upcoming';
  readonly tasks: readonly GanttTask[];
}

export interface ProjectGantt {
  /** Meses del eje de tiempo con su peso relativo (proporcional a días del mes, como en el Figma). */
  readonly months: ReadonlyArray<{ label: string; weight: number }>;
  readonly todayPercent: number;
  readonly modules: readonly GanttModule[];
}

export type ClientMilestoneStatus = 'completed' | 'awaiting_approval' | 'pending';

export interface ClientMilestone {
  readonly id: string;
  readonly title: string;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly status: ClientMilestoneStatus;
  /** Caja verde "✓ Aprobado por…" — solo en hitos `completed` que ya se aprobaron. */
  readonly approvalNote?: string;
  /** Caja gris "Esperando OK del cliente (…)" junto al botón "Dar OK" — solo en `awaiting_approval`. */
  readonly waitingText?: string;
  /** Caja gris informativa en hitos `pending` (Figma: el último hito de la fase). */
  readonly pendingNote?: string;
}

export interface ClientAttentionPoint {
  readonly id: string;
  readonly description: string;
  readonly responsibleName: string;
  readonly actionPlan: string;
  readonly closingDate: string;
}

export interface ClientIncident {
  readonly id: string;
  readonly description: string;
}

export interface ClientProjectDetail {
  readonly id: string;
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
  readonly progressActualPercent: number;
  readonly progressExpectedPercent: number;
  readonly endDate: string;
  readonly daysRemaining: number;
  readonly roadmap: readonly ClientRoadmapPhase[];
  readonly gantt: ProjectGantt;
  /** Subtítulo de "Hitos y aprobaciones" (Figma: "Fase 2 · Módulo de Tickets con Agente IA — registro de entregas y OK del cliente"). */
  readonly milestonesCaption: string;
  readonly milestones: readonly ClientMilestone[];
  readonly attentionPoints: readonly ClientAttentionPoint[];
  readonly incidents: readonly ClientIncident[];
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
