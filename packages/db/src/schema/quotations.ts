import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { projects } from './projects';
import { users } from './identity';

/** Una cotización por proyecto. Nunca se materializa en los campos operativos de projects aquí. */
export const projectQuotations = pgTable('project_quotations', {
  id: primaryId(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, (t) => [uniqueIndex('project_quotations_project_key').on(t.projectId)]);

/** Snapshot comercial completo y editable solo mientras esté en borrador. */
export const quotationVersions = pgTable('quotation_versions', {
  id: primaryId(),
  quotationId: uuid('quotation_id').notNull().references(() => projectQuotations.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  origin: varchar('origin', { length: 20 }).notNull().default('manual'),
  aiReviewStatus: varchar('ai_review_status', { length: 20 }),
  revision: integer('revision').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  editedByUserId: uuid('edited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  hourlyRate: numeric('hourly_rate', { precision: 16, scale: 4 }),
  currency: varchar('currency', { length: 3 }).notNull().default('UF'),
  tax: varchar('tax', { length: 10 }).notNull().default('iva19'),
  draft: jsonb('draft').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  totalHours: numeric('total_hours', { precision: 14, scale: 2 }).notNull().default('0'),
  netAmount: numeric('net_amount', { precision: 18, scale: 4 }),
  totalAmount: numeric('total_amount', { precision: 18, scale: 4 }),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
}, (t) => [
  uniqueIndex('quotation_versions_number_key').on(t.quotationId, t.versionNumber),
  index('quotation_versions_status_idx').on(t.quotationId, t.status),
  check('quotation_versions_status_chk', sql`${t.status} IN ('draft','sent','approved')`),
  check('quotation_versions_origin_chk', sql`${t.origin} IN ('manual','copy','ai')`),
  check('quotation_versions_ai_review_chk', sql`${t.aiReviewStatus} IS NULL OR ${t.aiReviewStatus} IN ('pending','accepted')`),
  check('quotation_versions_revision_chk', sql`${t.revision} >= 1`),
  check('quotation_versions_number_chk', sql`${t.versionNumber} >= 1`),
  check('quotation_versions_rate_chk', sql`${t.hourlyRate} IS NULL OR ${t.hourlyRate} >= 0`),
  check('quotation_versions_total_hours_chk', sql`${t.totalHours} >= 0`),
  check('quotation_versions_net_chk', sql`${t.netAmount} IS NULL OR ${t.netAmount} >= 0`),
  check('quotation_versions_total_chk', sql`${t.totalAmount} IS NULL OR ${t.totalAmount} >= 0`),
]);

/** Eventos inmutables: creación y edición. En R3 añadiremos envío, aprobación y traspaso. */
export const quotationEvents = pgTable('quotation_events', {
  id: primaryId(),
  versionId: uuid('version_id').notNull().references(() => quotationVersions.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 40 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
}, (t) => [index('quotation_events_version_idx').on(t.versionId, t.occurredAt)]);
