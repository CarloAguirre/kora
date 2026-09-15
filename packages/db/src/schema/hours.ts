import { sql } from 'drizzle-orm';
import { boolean, date, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { users } from './identity';
import { projectModules, projects } from './projects';

/**
 * Ver docs/DECISION-M4-HORAS.md.
 *
 * `assignment` y `category` se migran como texto libre, no como enum: la
 * v1 tiene 3.008 valores distintos de `categoria` (es una etiqueta de tarea,
 * no una categoría cerrada) y `asignacion` acumula valores históricos
 * ('Soporte', 'Apoyo Interno', 'Ticket-IN0529'...) que ya no están en el
 * selector actual del formulario. Forzar un enum de base de datos habría
 * rechazado miles de filas reales. El conjunto vigente para altas nuevas se
 * valida en la capa de aplicación (`HOUR_ENTRY_ASSIGNMENTS` en los contratos),
 * no en el esquema.
 */
export const hourEntryStatusEnum = pgEnum('hour_entry_status', ['pending', 'approved', 'rejected']);

export const hourEntries = pgTable(
  'hour_entries',
  {
    id: primaryId(),
    /** El `id` de `registro_hh` en la v1 ya era uuid — se preserva tal cual para el ETL idempotente. */
    legacyId: uuid('legacy_id'),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** Fase/módulo del proyecto contra la que se imputa esta hora — opcional. */
    moduleId: uuid('module_id').references(() => projectModules.id, { onDelete: 'set null' }),

    assignment: text('assignment'),
    category: text('category').notNull().default(''),
    description: text('description').notNull().default(''),

    /** Bloqueo reportado al registrar la hora — visible para el líder en la Bitácora del proyecto. No hay sistema de incidentes aparte. */
    hasBlocker: boolean('has_blocker').notNull().default(false),
    blockerDescription: text('blocker_description'),

    hours: numeric('hours', { precision: 10, scale: 2 }).notNull().default('0'),
    date: date('date', { mode: 'date' }).notNull(),
    isOvertime: boolean('is_overtime').notNull().default(false),

    /** Fase del proyecto en el momento del registro — foto histórica, no se recalcula. */
    projectStageAtEntry: text('project_stage_at_entry'),

    status: hourEntryStatusEnum('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    decisionUserId: uuid('decision_user_id').references(() => users.id, { onDelete: 'set null' }),
    decisionAt: timestamp('decision_at', { withTimezone: true, mode: 'date' }),

    /** Aprobador designado — solo aplica a horas sin proyecto de un colaborador. */
    designatedApproverUserId: uuid('designated_approver_user_id').references(() => users.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('hour_entries_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);

export const holidayTypeEnum = pgEnum('holiday_type', ['national', 'regional', 'company']);

/** Feriados — usados por el registro de horas para marcar días no laborales. */
export const holidays = pgTable(
  'holidays',
  {
    id: primaryId(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    regionCode: varchar('region_code', { length: 10 }).notNull().default(''),
    date: date('date', { mode: 'date' }).notNull(),
    name: text('name').notNull(),
    type: holidayTypeEnum('type').notNull().default('national'),
    isWorkingDay: boolean('is_working_day').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('holidays_unique_key').on(table.countryCode, table.regionCode, table.date, table.name)],
);
