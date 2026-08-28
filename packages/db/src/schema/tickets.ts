import { sql } from 'drizzle-orm';
import { date, integer, jsonb, numeric, pgEnum, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
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
export const ticketServiceTypeEnum = pgEnum('ticket_service_type', ['incident', 'inquiry', 'improvement', 'bug']);

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
 * ver docs/DECISION-M5-TICKETS.md). Al aprobarse genera un `hour_entries` ya
 * aprobado (`hourEntryId`); no pasa por el flujo normal de `pending → approved`
 * de horas, porque la aprobación ya ocurrió aquí.
 */
export const ticketHhRequests = pgTable('ticket_hh_requests', {
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

  status: ticketHhRequestStatusEnum('status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  hourEntryId: uuid('hour_entry_id').references(() => hourEntries.id, { onDelete: 'set null' }),

  ...timestamps,
});

export const supportPlanTypeEnum = pgEnum('support_plan_type', ['monthly', 'bundle', 'on_demand']);
export const supportPlanStatusEnum = pgEnum('support_plan_status', ['active', 'ended', 'cancelled']);
export const supportSurplusPolicyEnum = pgEnum('support_surplus_policy', ['accumulate', 'expire']);

/** Contrato de soporte de un cliente/proyecto. Ver `soporte_has_active_usable_plan`. */
export const supportPlans = pgTable(
  'support_plans',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    planType: supportPlanTypeEnum('plan_type').notNull(),
    surplusPolicy: supportSurplusPolicyEnum('surplus_policy'),
    status: supportPlanStatusEnum('status').notNull().default('active'),

    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }),

    contractedHours: numeric('contracted_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    planValueUf: numeric('plan_value_uf', { precision: 12, scale: 2 }).notNull().default('0'),
    extraHourValueUf: numeric('extra_hour_value_uf', { precision: 12, scale: 2 }).notNull().default('0'),

    ...timestamps,
  },
  (table) => [uniqueIndex('support_plans_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`)],
);

export const supportPeriodStatusEnum = pgEnum('support_period_status', ['active', 'expired', 'closed', 'cancelled']);

/** Período mensual de un plan de soporte mensual, con su saldo. */
export const supportMonthlyPeriods = pgTable(
  'support_monthly_periods',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    planId: uuid('plan_id')
      .notNull()
      .references(() => supportPlans.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

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
  (table) => [uniqueIndex('support_monthly_periods_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`)],
);
