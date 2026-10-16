import { sql } from 'drizzle-orm';
import { boolean, date, integer, jsonb, numeric, pgEnum, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps } from './columns';
import { clients } from './clients';
import { users } from './identity';
import { projects } from './projects';
import { hourEntries } from './hours';

/** Ver docs/DECISION-M5-TICKETS.md. */

/**
 * Genera el código visible de un ticket creado en la v2 (`TK-0001`, mismo
 * formato que el `id_ticket` legado). Arranca en el máximo `legacy_id`
 * numérico ya migrado — sembrado por la migración que crea esta secuencia —
 * para no chocar con códigos importados de la v1.
 */
export const ticketsCodeSeq = pgSequence('tickets_code_seq');

export const ticketStatusEnum = pgEnum('ticket_status', ['pending', 'in_progress', 'in_testing', 'done', 'closed']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['critical', 'high', 'medium', 'low']);
export const ticketServiceTypeEnum = pgEnum('ticket_service_type', ['incident', 'inquiry', 'improvement', 'bug', 'operational']);

export const tickets = pgTable(
  'tickets',
  {
    id: primaryId(),
    /** El `TK-0001` legado — se conserva como código visible, no solo como referencia de migración. */
    legacyId: varchar('legacy_id', { length: 20 }),

    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    /** Proyecto contra el que se abre el ticket (puede ser de soporte o de desarrollo). */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** Proyecto de desarrollo vinculado, cuando el ticket se abre contra un proyecto de soporte. */
    developmentProjectId: uuid('development_project_id').references(() => projects.id, { onDelete: 'set null' }),

    title: varchar('title', { length: 300 }).notNull(),
    serviceType: ticketServiceTypeEnum('service_type'),
    description: text('description'),
    evidenceUrl: text('evidence_url'),

    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    priority: ticketPriorityEnum('priority'),
    estimatedHours: integer('estimated_hours'),

    status: ticketStatusEnum('status').notNull().default('pending'),
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    usedHours: numeric('used_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    /** Habilitado por el líder del proyecto/equipo — sin esto, el ticket no admite solicitudes de HH marcadas como horas extra. */
    allowsOvertime: boolean('allows_overtime').notNull().default(false),
    /** Factura de soporte a la que quedaron enlazadas las horas de este ticket (solo planes `on_demand`) — evita facturar dos veces el mismo trabajo. */
    invoiceId: uuid('invoice_id').references(() => supportInvoices.id, { onDelete: 'set null' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [uniqueIndex('tickets_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`)],
);

/**
 * Bitácora de eventos del ticket. `eventType` es texto libre, no enum — igual
 * que `asignacion` en horas: la v1 ya tiene 18 tipos de evento distintos y es
 * un registro de auditoría, no un catálogo cerrado.
 */
export const ticketHistoryEntries = pgTable(
  'ticket_history_entries',
  {
    id: primaryId(),
    /** `ticket_history.id` de la v1 (ya era uuid) — permite upsert idempotente en reimportaciones. */
    legacyId: uuid('legacy_id'),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (table) => [uniqueIndex('ticket_history_entries_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`)],
);

export const ticketHhRequestStatusEnum = pgEnum('ticket_hh_request_status', ['pending', 'approved', 'rejected']);

/**
 * Solicitud de horas desde un ticket ("siguiente paso de M5" —
 * ver docs/DECISION-M5-TICKETS.md). Si queda pendiente de revisión, se crea de
 * inmediato su `hour_entries` vinculado (`hourEntryId`) en estado `pending` —
 * así aparece a la vez en el ticket y en la cola general de "Aprobaciones de
 * horas". Aprobar/rechazar la solicitud transiciona ESE MISMO `hour_entries`
 * (o viceversa, si se decide desde la cola general — ver
 * `TicketHhRequestSyncPort`). La autoaprobación (quien pide sería su propio
 * aprobador) es la única excepción: crea el `hour_entries` directamente
 * `approved`, sin pasar por `pending`.
 */
export const ticketHhRequests = pgTable(
  'ticket_hh_requests',
  {
    id: primaryId(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    date: date('date', { mode: 'date' }).notNull(),
    hours: numeric('hours', { precision: 10, scale: 2 }).notNull(),
    note: text('note'),
    isOvertime: boolean('is_overtime').notNull().default(false),

    status: ticketHhRequestStatusEnum('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    /** Ahora también se pobla al CREAR una solicitud que queda pendiente (no solo al aprobarla) — ver `CreateTicketHhRequestUseCase`. */
    hourEntryId: uuid('hour_entry_id').references(() => hourEntries.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (table) => [uniqueIndex('ticket_hh_requests_hour_entry_id_key').on(table.hourEntryId).where(sql`${table.hourEntryId} is not null`)],
);

export const supportPlanTypeEnum = pgEnum('support_plan_type', ['monthly', 'bundle', 'on_demand']);
export const supportPlanStatusEnum = pgEnum('support_plan_status', ['active', 'ended', 'cancelled']);
export const supportSurplusPolicyEnum = pgEnum('support_surplus_policy', ['accumulate', 'expire']);
/** `single` = 1 proyecto de desarrollo cubierto (ver `support_plan_projects`); `consolidated` = varios compartiendo una sola bolsa/factura. */
export const supportPlanScopeEnum = pgEnum('support_plan_scope', ['single', 'consolidated']);
/** Moneda del contrato — gobierna `plan_value_uf`/`extra_hour_value_uf` pese al sufijo heredado. Sin conversión entre monedas: cada contrato se queda en la suya. */
export const supportPlanCurrencyEnum = pgEnum('support_plan_currency', ['UF', 'CLP', 'USD']);

/**
 * Contrato de soporte de un cliente. Ver `soporte_has_active_usable_plan`.
 *
 * `project_id` es el proyecto "contenedor" de soporte (el de la v1 en las
 * filas migradas por el ETL). Los contratos creados desde la v2 también lo
 * tienen — `CreateSupportPlanUseCase` lo crea; los anteriores a ese cambio se
 * rellenan con `backfill:support-plan-container-projects` — y además enlazan
 * los proyectos de desarrollo que cubren vía `support_plan_projects` (retoma
 * `soporte_proyecto`, deliberadamente diferida en la migración — ver
 * docs/DECISION-M5-TICKETS.md). Sigue siendo nullable por esos contratos
 * previos al backfill.
 */
export const supportPlans = pgTable(
  'support_plans',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

    planType: supportPlanTypeEnum('plan_type').notNull(),
    scope: supportPlanScopeEnum('scope').notNull().default('single'),
    surplusPolicy: supportSurplusPolicyEnum('surplus_policy'),
    status: supportPlanStatusEnum('status').notNull().default('active'),

    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }),

    contractedHours: numeric('contracted_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    /** El nombre de estas dos columnas quedó heredado de cuando solo existía UF — la moneda real la da `currency`. */
    planValueUf: numeric('plan_value_uf', { precision: 12, scale: 2 }).notNull().default('0'),
    extraHourValueUf: numeric('extra_hour_value_uf', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: supportPlanCurrencyEnum('currency').notNull().default('UF'),

    /** Nombre visible del contrato (ej. "Consolidado – Edificate"). En `scope='single'` se autogenera del proyecto vinculado si se deja vacío. */
    name: text('name'),
    /** Segmento de URL amigable, generado al crear a partir del nombre resuelto (ver `resolveSupportPlanName`) — no cambia si el nombre se edita después. */
    slug: varchar('slug', { length: 90 }).notNull(),
    /** Líder Kabeli a cargo del contrato — independiente del líder de cualquiera de los proyectos que cubre. */
    leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Override de contacto del contrato; `null` = usar el contacto por defecto del cliente. Mismo patrón sin FK que `projects.primary_contact_id`. */
    primaryContactId: uuid('primary_contact_id'),
    quotationLink: text('quotation_link'),
    contractLink: text('contract_link'),
    additionalLinks: text('additional_links'),

    /** Día del mes en que vence el cupo — solo aplica a `plan_type='monthly'` con `surplus_policy='expire'`. */
    dueDayOfMonth: integer('due_day_of_month'),

    /** Tiempos de resolución (SLA) pactados por prioridad, en horas. Dato nuevo: no existía en ningún lado antes de este contrato. */
    targetHoursCritical: numeric('target_hours_critical', { precision: 10, scale: 2 }),
    targetHoursHigh: numeric('target_hours_high', { precision: 10, scale: 2 }),
    targetHoursMedium: numeric('target_hours_medium', { precision: 10, scale: 2 }),
    targetHoursLow: numeric('target_hours_low', { precision: 10, scale: 2 }),

    /** Cierre explícito del contrato — distinto de `end_date`, que es el término pactado. */
    closedAt: date('closed_at', { mode: 'date' }),
    closeReason: text('close_reason'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('support_plans_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    uniqueIndex('support_plans_slug_key').on(table.slug),
  ],
);

export const supportPeriodStatusEnum = pgEnum('support_period_status', ['active', 'expired', 'closed', 'cancelled']);

/**
 * Período mensual de un plan de soporte mensual, con su saldo.
 *
 * `project_id` es nullable por la misma razón que en `support_plans`: un
 * contrato `consolidated` pool-ea las horas a nivel de CONTRATO, no de un
 * proyecto en particular, así que sus períodos no tienen un `project_id` propio.
 */
export const supportMonthlyPeriods = pgTable(
  'support_monthly_periods',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    planId: uuid('plan_id')
      .notNull()
      .references(() => supportPlans.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }).notNull(),
    surplusPolicy: supportSurplusPolicyEnum('surplus_policy').notNull(),

    contractedHours: numeric('contracted_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    reusedBalanceHours: numeric('reused_balance_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    consumedHoursStart: numeric('consumed_hours_start', { precision: 10, scale: 2 }).notNull().default('0'),
    consumedHoursEnd: numeric('consumed_hours_end', { precision: 10, scale: 2 }),
    consumedHoursPeriod: numeric('consumed_hours_period', { precision: 10, scale: 2 }).notNull().default('0'),
    surplusHours: numeric('surplus_hours', { precision: 10, scale: 2 }).notNull().default('0'),

    status: supportPeriodStatusEnum('status').notNull().default('active'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('support_monthly_periods_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    // Los períodos siguientes se crean de forma perezosa al leer el plan: dos requests simultáneos no deben duplicar el mes.
    uniqueIndex('support_monthly_periods_plan_start_key').on(table.planId, table.startDate).where(sql`${table.status} <> 'cancelled'`),
  ],
);

/**
 * Enlace contrato de soporte ↔ proyecto de desarrollo cubierto. Retoma
 * `soporte_proyecto` (143 filas en la v1), deliberadamente dejada sin migrar
 * — ver docs/DECISION-M5-TICKETS.md: "si M6/M7 llegan a necesitar el enlace a
 * nivel de proyecto, se retoma". `scope='single'` tiene exactamente 1 fila
 * por plan; `'consolidated'`, N.
 */
export const supportPlanProjects = pgTable(
  'support_plan_projects',
  {
    id: primaryId(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => supportPlans.id, { onDelete: 'cascade' }),
    developmentProjectId: uuid('development_project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [uniqueIndex('support_plan_projects_plan_project_key').on(table.planId, table.developmentProjectId)],
);

/**
 * Una factura de soporte es un hecho consumado, no un estado. Que exista una
 * fila para `(plan_id, period_key)` YA significa "facturado" ese período; que
 * no exista significa "por facturar" — el monto de un período sin facturar se
 * calcula en vivo (`SupportBillingCalculator`), nunca se guarda de antemano.
 *
 * El estado de PAGO tampoco se guarda, se deriva al leer: `paid_at` no nulo →
 * pagado; si no, `due_at` vencido → atrasado; si no, pendiente. Un estado
 * guardado se desincroniza del tiempo real; uno derivado, por definición, no.
 *
 * Kora no emite la factura: esta fila registra que ya se emitió (folio,
 * fecha) y cuándo se pagó — nunca genera el documento tributario.
 */
export const supportInvoices = pgTable(
  'support_invoices',
  {
    id: primaryId(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => supportPlans.id, { onDelete: 'cascade' }),
    /** 'YYYY-MM' del ciclo facturado — para `monthly` coincide con el período de `support_monthly_periods`; para `bundle`/`on_demand` es el mes calendario en que se emitió. */
    periodKey: varchar('period_key', { length: 7 }).notNull(),

    /** Monto congelado al momento de facturar — no se recalcula después, aunque cambien las horas registradas. */
    amountUf: numeric('amount_uf', { precision: 12, scale: 2 }).notNull(),
    /** Moneda congelada junto con el monto — la del contrato al momento de facturar, sin default: se pasa siempre explícita. */
    currency: supportPlanCurrencyEnum('currency').notNull(),
    hoursBilled: numeric('hours_billed', { precision: 10, scale: 2 }),

    folio: varchar('folio', { length: 50 }).notNull(),
    invoicedAt: date('invoiced_at', { mode: 'date' }).notNull(),
    /** Vencimiento del pago — hoy se calcula como `invoicedAt + 30 días` al crear la factura, pero se guarda (no se recalcula) para poder hacerlo configurable sin migrar datos. */
    dueAt: date('due_at', { mode: 'date' }),
    paidAt: date('paid_at', { mode: 'date' }),
    /** Solo el nombre del archivo adjunto — la v2 todavía no tiene almacenamiento de archivos (tarea transversal pendiente en docs/PLAN-MODULOS.md). */
    attachmentName: text('attachment_name'),

    /** Trazabilidad hacia el período mensual facturado — solo `plan_type='monthly'`. */
    monthlyPeriodId: uuid('monthly_period_id').references(() => supportMonthlyPeriods.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (table) => [uniqueIndex('support_invoices_plan_period_key').on(table.planId, table.periodKey)],
);
