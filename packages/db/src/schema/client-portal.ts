import { boolean, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clients, clientContacts } from './clients';
import { users } from './identity';
import { projects, projectModuleDeliveries } from './projects';
import { supportPlans } from './tickets';

/**
 * Autorizaciones explícitas del portal EXTERNO, independientes de la vista
 * previa PMO/Administrador. Ninguna de estas tablas cambia permisos internos.
 */
export const clientPortalAccounts = pgTable('client_portal_accounts', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().unique().references(() => clientContacts.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('client_portal_accounts_client_idx').on(table.clientId)]);

export const clientPortalProjectGrants = pgTable('client_portal_project_grants', {
  userId: uuid('user_id').notNull().references(() => clientPortalAccounts.userId, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.projectId] }),
  index('client_portal_project_grants_project_idx').on(table.projectId),
]);

export const clientPortalSupportGrants = pgTable('client_portal_support_grants', {
  userId: uuid('user_id').notNull().references(() => clientPortalAccounts.userId, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => supportPlans.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.planId] }),
  index('client_portal_support_grants_plan_idx').on(table.planId),
]);

/** OK de recepción externo, independiente del estado "approved" del líder de Kabeli. */
export const clientPortalDeliveryReceipts = pgTable('client_portal_delivery_receipts', {
  deliveryId: uuid('delivery_id').primaryKey().references(() => projectModuleDeliveries.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  receivedByUserId: uuid('received_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('client_portal_delivery_receipts_project_idx').on(table.projectId),
]);
