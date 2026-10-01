import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps } from './columns';
import { clients } from './clients';
import { users } from './identity';
import { teamMembers, teams } from './organization';

/** Ver docs/DECISION-M3-ESTADOS.md: por qué son cuatro campos independientes. */
export const projectTypeEnum = pgEnum('project_type', ['development', 'support']);
export const projectSalesStageEnum = pgEnum('project_sales_stage', ['prospect', 'quoted', 'approved']);
export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'active',
  'on_hold',
  'finished',
  'cancelled',
]);
export const projectPhaseEnum = pgEnum('project_phase', [
  'discovery',
  'development',
  'testing',
  'pilot',
  'closed',
]);
export const projectPriorityEnum = pgEnum('project_priority', ['low', 'medium', 'high']);
/** Qué disparó el Hito 0 — ver `hito0At`/`hito0Reason` más abajo. */
export const projectHito0SourceEnum = pgEnum('project_hito0_source', ['auto_invoice', 'manual']);
export const participationTypeEnum = pgEnum('participation_type', ['team', 'project_leader']);

/** Catálogo propio del módulo/fase — independiente de `projectPhaseEnum` (que es el avance del proyecto completo). */
export const projectModuleStageEnum = pgEnum('project_module_stage', [
  'discovery',
  'development',
  'production',
  'pilot',
  'closed',
]);
export const projectModuleDeliveryStatusEnum = pgEnum('project_module_delivery_status', [
  'planned',
  'delivered',
  'approved',
]);
export const projectModuleTaskStatusEnum = pgEnum('project_module_task_status', [
  'todo',
  'in_progress',
  'in_review',
  'done',
]);
/** Ámbito de la tarea — permite calcular el % de avance por ámbito en "Resumen de avance" del módulo. */
export const projectModuleTaskScopeEnum = pgEnum('project_module_task_scope', [
  'diseno',
  'desarrollo',
  'qa',
  'revision_cliente',
]);

/** Tipo de una entrada de bitácora — "evento" (hora registrada) no está acá: no es un `project_observation`, viene de `hour_entries`. */
export const projectObservationTypeEnum = pgEnum('project_observation_type', [
  'hito',
  'incidente',
  'compromiso',
  'atencion',
  'observacion',
  'cambio_proyecto',
]);
/** Estado de una entrada de bitácora — nulo para `observacion`/`cambio_proyecto` (sin ciclo de vida). */
export const projectObservationStatusEnum = pgEnum('project_observation_status', [
  'abierto',
  'resuelto',
  'pendiente',
  'cumplido',
  'activo',
  'rechazado',
]);

/** Estado de un tramo de pago del proyecto — independiente del estado de facturación de soporte (`support_invoices`). */
export const projectPaymentStatusEnum = pgEnum('project_payment_status', ['pending', 'invoiced', 'paid']);

export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),

    name: varchar('name', { length: 300 }).notNull(),
    /** Segmento de URL amigable, generado del nombre al crear — no cambia si el nombre se edita después. */
    slug: varchar('slug', { length: 90 }).notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    primaryContactId: uuid('primary_contact_id'),

    type: projectTypeEnum('type').notNull(),
    salesStage: projectSalesStageEnum('sales_stage'),
    status: projectStatusEnum('status').notNull().default('active'),
    phase: projectPhaseEnum('phase'),
    priority: projectPriorityEnum('priority'),

    leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
    developerUserId: uuid('developer_user_id').references(() => users.id, { onDelete: 'set null' }),
    commercialManagerUserId: uuid('commercial_manager_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    startDate: date('start_date', { mode: 'date' }),
    endDate: date('end_date', { mode: 'date' }),
    estimatedDeliveryDate: date('estimated_delivery_date', { mode: 'date' }),

    soldHours: numeric('sold_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    usedHours: numeric('used_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    expectedProgress: integer('expected_progress'),
    actualProgress: integer('actual_progress'),

    /** Compromiso de soporte declarado en el proyecto. La reconciliación financiera vive en M5. */
    supportPlanDescription: text('support_plan_description'),
    supportHours: numeric('support_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    overtimeRateUf: numeric('overtime_rate_uf', { precision: 10, scale: 4 }).notNull().default('0'),
    /** Habilitado por el líder del proyecto/equipo — sin esto, las horas cargadas contra este proyecto no pueden marcarse como horas extra. */
    allowsOvertime: boolean('allows_overtime').notNull().default(false),

    quotationLink: text('quotation_link'),
    contractLink: text('contract_link'),
    additionalLinks: text('additional_links'),

    /** Motivo declarado mientras `status = 'on_hold'`. */
    onHoldReason: text('on_hold_reason'),
    /** Si está activo, el período detenido no debería contar para plazos/desviación — ese cálculo no está implementado todavía. */
    stopsClock: boolean('stops_clock').notNull().default(false),
    scopeNotes: text('scope_notes'),
    deliveryDocumentation: text('delivery_documentation'),

    /** "Accesos y enlaces" del tab Extras — informativos, no se conectan al portal cliente todavía. */
    demoLink: text('demo_link'),
    testEnvironmentLink: text('test_environment_link'),
    figmaLink: text('figma_link'),
    documentationLink: text('documentation_link'),

    /** "Datos de impacto en el negocio" del tab Extras — comparación manual vs. automatizado, declarada por el líder. */
    impactBeforeHours: numeric('impact_before_hours', { precision: 10, scale: 2 }),
    impactBeforePeople: text('impact_before_people'),
    impactBeforeDuration: text('impact_before_duration'),
    impactBeforeModality: text('impact_before_modality'),
    impactAfterHours: numeric('impact_after_hours', { precision: 10, scale: 2 }),
    impactAfterPeople: text('impact_after_people'),
    impactAfterDuration: text('impact_after_duration'),
    impactAfterModality: text('impact_after_modality'),

    /** "Métricas QA" del tab Extras — datos de la etapa de pruebas, declarados por el líder. */
    qaTestingStartDate: date('qa_testing_start_date', { mode: 'date' }),
    qaTestingEndDate: date('qa_testing_end_date', { mode: 'date' }),
    qaEvaluatedModule: text('qa_evaluated_module'),
    qaPlannedTests: integer('qa_planned_tests'),
    qaExecutedTests: integer('qa_executed_tests'),
    qaFailedTests: integer('qa_failed_tests'),

    /** "Avance del periodo" del portal cliente — narrativa de logros declarada por el líder, igual criterio que impacto/QA. */
    periodReportDate: date('period_report_date', { mode: 'date' }),
    periodReportAchievements: text('period_report_achievements').array(),

    /** Hito 0 quedó pausado esperando que Gerencia (admin/pmo) active el proyecto a mano — ver `project_billing_settings`. */
    pendingManagementApproval: boolean('pending_management_approval').notNull().default(false),

    /**
     * Hito 0 (kickoff): fecha en que el proyecto pasó a Activo por primera vez
     * — automático (primera factura del tramo con `sortOrder` más bajo) o
     * manual (Gerencia/PMO, sin factura). Editable por Gerencia/PMO después
     * ("corregir fecha" — ver docs pegados de Leslie). `hito0Reason` es
     * obligatorio solo cuando `hito0Source = 'manual'`.
     */
    hito0At: timestamp('hito0_at', { withTimezone: true }),
    hito0Source: projectHito0SourceEnum('hito0_source'),
    hito0Reason: text('hito0_reason'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('projects_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    uniqueIndex('projects_client_name_key')
      .on(sql`coalesce(${table.clientId}::text, '-')`, sql`lower(btrim(${table.name}))`)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('projects_slug_key').on(table.slug),
  ],
);

/** Equipos asignados a un proyecto, con su propio líder de proyecto. */
export const projectTeams = pgTable(
  'project_teams',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedHours: numeric('assigned_hours', { precision: 10, scale: 2 }),
    /** Conteo de colaboradores del equipo en este proyecto — no personas nombradas, ver `projectTeamMembers` para eso. */
    memberCount: integer('member_count'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('project_teams_project_team_key').on(table.projectId, table.teamId),
    uniqueIndex('project_teams_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);

/** Miembro concreto asignado a trabajar en el proyecto, dentro de un equipo. */
export const projectTeamMembers = pgTable(
  'project_team_members',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
    activity: text('activity'),
    assignedHours: numeric('assigned_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    consumedHours: numeric('consumed_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('project_team_members_legacy_id_key')
      .on(table.legacyId)
      .where(sql`${table.legacyId} is not null`),
  ],
);

/** Histórico de entradas y salidas de personas y equipos de un proyecto. */
export const projectParticipationHistory = pgTable('project_participation_history', {
  id: primaryId(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  participationType: participationTypeEnum('participation_type').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
});

/** Fase/módulo del proyecto — unidad de entrega con su propia etapa, horas y fechas, independiente del resto. */
export const projectModules = pgTable('project_modules', {
  id: primaryId(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 300 }).notNull(),
  initialStage: projectModuleStageEnum('initial_stage').notNull(),
  /** Se actualiza durante la ejecución del módulo — arranca igual a `initialStage`. */
  currentStage: projectModuleStageEnum('current_stage').notNull(),
  estimatedHours: numeric('estimated_hours', { precision: 10, scale: 2 }),
  estimatedStartDate: date('estimated_start_date', { mode: 'date' }),
  estimatedEndDate: date('estimated_end_date', { mode: 'date' }),
  ...timestamps,
});

/** Entrega estimada de un módulo — hace de hito "Entrega a cliente" (no existe un concepto de hito genérico separado). */
export const projectModuleDeliveries = pgTable('project_module_deliveries', {
  id: primaryId(),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => projectModules.id, { onDelete: 'cascade' }),
  /** Equipo responsable de esta entrega — permite a un colaborador filtrar "las entregas de mi equipo". */
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  /** Nullable por entregas creadas antes de este campo — las nuevas siempre lo piden (ver `addProjectModuleDeliverySchema`). */
  name: varchar('name', { length: 300 }),
  description: text('description'),
  /** Colaborador del equipo responsable a quien se le asignó esta entrega — `null` ⇔ "Sin asignar". */
  assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  estimatedDate: date('estimated_date', { mode: 'date' }).notNull(),
  status: projectModuleDeliveryStatusEnum('status').notNull().default('planned'),
  /** Motivo del último rechazo del líder — se limpia al aprobar o al volver a marcarla entregada. */
  rejectionReason: text('rejection_reason'),
  ...timestamps,
});

/** Tramo de trabajo de un equipo dentro de una fase/módulo — con su propio rango de fechas ("Roadmap"). */
export const projectModuleSegments = pgTable('project_module_segments', {
  id: primaryId(),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => projectModules.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 300 }).notNull(),
  startDate: date('start_date', { mode: 'date' }).notNull(),
  endDate: date('end_date', { mode: 'date' }).notNull(),
  ...timestamps,
});

/**
 * Colaborador asignado a un tramo de ejecución — siempre del equipo del tramo. Con `dailyPercent`
 * el tramo genera sus filas de Forecast (ver `SegmentForecastSyncService`); sin él, queda solo como
 * asignación informativa.
 */
export const projectModuleSegmentMembers = pgTable(
  'project_module_segment_members',
  {
    id: primaryId(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => projectModuleSegments.id, { onDelete: 'cascade' }),
    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
    /** % de la jornada diaria del colaborador dedicado a este tramo (1–100). */
    dailyPercent: numeric('daily_percent', { precision: 5, scale: 2 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('project_module_segment_members_segment_member_key').on(table.segmentId, table.teamMemberId),
  ],
);

/** Tarea puntual (una fecha) de una fase/módulo, por equipo y opcionalmente asignada a una persona — marcador en el Roadmap y base de "Mis tareas". */
export const projectModuleTasks = pgTable('project_module_tasks', {
  id: primaryId(),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => projectModules.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 300 }).notNull(),
  description: text('description'),
  /** Inicio opcional — cuando está presente, el Roadmap dibuja la tarea como barra (`date` sigue siendo el fin/fecha límite). */
  startDate: date('start_date', { mode: 'date' }),
  date: date('date', { mode: 'date' }).notNull(),
  estimatedHours: numeric('estimated_hours', { precision: 10, scale: 2 }),
  status: projectModuleTaskStatusEnum('status').notNull().default('todo'),
  scope: projectModuleTaskScopeEnum('scope').notNull().default('desarrollo'),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  /** Motivo del último rechazo del líder — se limpia al aprobar o al volver a marcarla en revisión. */
  rejectionReason: text('rejection_reason'),
  ...timestamps,
});

/**
 * Observaciones/bitácora de proyecto — el catálogo abierto de tipos
 * (hito/incidente/compromiso/atención/observación) que se ve en "Agregar
 * registro a la bitácora". Sin adjuntos todavía: pendiente de Storage.
 */
export const projectObservations = pgTable(
  'project_observations',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: projectObservationTypeEnum('type').notNull().default('observacion'),
    /** Corto, opcional — las notas rápidas del compositor original de Observaciones no lo llevan. */
    title: varchar('title', { length: 200 }),
    message: text('message').notNull(),
    /** Nulo para `observacion`; para el resto, el mapper lo fija según `type` al crear (ver `PROJECT_OBSERVATION_DEFAULT_STATUS`). */
    status: projectObservationStatusEnum('status'),
    moduleId: uuid('module_id').references(() => projectModules.id, { onDelete: 'set null' }),
    /** Fecha del hecho — puede ser distinta de `createdAt` (cuándo se registró en el sistema). */
    date: date('date', { mode: 'date' })
      .notNull()
      .default(sql`now()`),
    /**
     * Registro de activación del proyecto (Hito 0) — uno por proyecto. Su `date` es la fecha del
     * Hito 0 y se mantiene en sync con `projects.hito0_at`: "Corregir fecha" se hace desde este
     * registro en la bitácora (ver `CorrectProjectHito0DateUseCase`).
     */
    isHito0: boolean('is_hito0').notNull().default(false),
    /**
     * Registros automáticos (`cambio_proyecto`) sobre una entrega o tarea concreta — asignación,
     * terminada, aprobada, rechazada, editada — para armar su historial (quién y cuándo, a tiempo o
     * con atraso). `set null` al borrarla: el registro "eliminada" y los anteriores se conservan.
     */
    deliveryId: uuid('delivery_id').references(() => projectModuleDeliveries.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => projectModuleTasks.id, { onDelete: 'set null' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    index('project_observations_module_idx').on(table.moduleId),
    index('project_observations_delivery_idx').on(table.deliveryId),
    index('project_observations_task_idx').on(table.taskId),
  ],
);

/** Tramo de pago del proyecto ("Facturación" del portal cliente) — cronograma de cobro, independiente de `support_invoices` (eso es soporte). */
export const projectPaymentMilestones = pgTable('project_payment_milestones', {
  id: primaryId(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** p.ej. "Inicio", "Marcha blanca". */
  name: varchar('name', { length: 120 }).notNull(),
  /** Nulo para tramos que no son un % del contrato (p.ej. "Desvío de horas (extra)"). */
  percent: numeric('percent', { precision: 5, scale: 2 }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  invoiceNumber: varchar('invoice_number', { length: 50 }),
  issuedAt: date('issued_at', { mode: 'date' }),
  status: projectPaymentStatusEnum('status').notNull().default('pending'),
  paidAt: date('paid_at', { mode: 'date' }),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  leader: one(users, { fields: [projects.leaderUserId], references: [users.id] }),
  teams: many(projectTeams),
  members: many(projectTeamMembers),
  observations: many(projectObservations),
  modules: many(projectModules),
  paymentMilestones: many(projectPaymentMilestones),
}));

export const projectModulesRelations = relations(projectModules, ({ one, many }) => ({
  project: one(projects, { fields: [projectModules.projectId], references: [projects.id] }),
  deliveries: many(projectModuleDeliveries),
  segments: many(projectModuleSegments),
  tasks: many(projectModuleTasks),
}));

export const projectModuleDeliveriesRelations = relations(projectModuleDeliveries, ({ one }) => ({
  module: one(projectModules, { fields: [projectModuleDeliveries.moduleId], references: [projectModules.id] }),
  team: one(teams, { fields: [projectModuleDeliveries.teamId], references: [teams.id] }),
  assignee: one(users, { fields: [projectModuleDeliveries.assigneeUserId], references: [users.id] }),
}));

export const projectModuleSegmentsRelations = relations(projectModuleSegments, ({ one, many }) => ({
  module: one(projectModules, { fields: [projectModuleSegments.moduleId], references: [projectModules.id] }),
  team: one(teams, { fields: [projectModuleSegments.teamId], references: [teams.id] }),
  members: many(projectModuleSegmentMembers),
}));

export const projectModuleSegmentMembersRelations = relations(projectModuleSegmentMembers, ({ one }) => ({
  segment: one(projectModuleSegments, {
    fields: [projectModuleSegmentMembers.segmentId],
    references: [projectModuleSegments.id],
  }),
  teamMember: one(teamMembers, { fields: [projectModuleSegmentMembers.teamMemberId], references: [teamMembers.id] }),
}));

export const projectModuleTasksRelations = relations(projectModuleTasks, ({ one }) => ({
  module: one(projectModules, { fields: [projectModuleTasks.moduleId], references: [projectModules.id] }),
  team: one(teams, { fields: [projectModuleTasks.teamId], references: [teams.id] }),
  assignee: one(users, { fields: [projectModuleTasks.assigneeUserId], references: [users.id] }),
}));

export const projectTeamsRelations = relations(projectTeams, ({ one }) => ({
  project: one(projects, { fields: [projectTeams.projectId], references: [projects.id] }),
  team: one(teams, { fields: [projectTeams.teamId], references: [teams.id] }),
}));

export const projectTeamMembersRelations = relations(projectTeamMembers, ({ one }) => ({
  project: one(projects, { fields: [projectTeamMembers.projectId], references: [projects.id] }),
  team: one(teams, { fields: [projectTeamMembers.teamId], references: [teams.id] }),
}));

export const projectObservationsRelations = relations(projectObservations, ({ one }) => ({
  project: one(projects, { fields: [projectObservations.projectId], references: [projects.id] }),
}));

export const projectPaymentMilestonesRelations = relations(projectPaymentMilestones, ({ one }) => ({
  project: one(projects, { fields: [projectPaymentMilestones.projectId], references: [projects.id] }),
}));

/**
 * Interruptor global de Hito 0 — fila única (`id` fijo). No es un motor de
 * configuración genérico: es el único ajuste de este tipo que existe hoy.
 */
export const projectBillingSettings = pgTable('project_billing_settings', {
  id: varchar('id', { length: 20 })
    .primaryKey()
    .default('singleton'),
  autoActivateFirstPayment: boolean('auto_activate_first_payment').notNull().default(true),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
});
