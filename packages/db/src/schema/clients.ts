import { relations, sql } from 'drizzle-orm';
import { date, integer, pgEnum, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps } from './columns';
import { businessSectors, comunas, countries, industries } from './catalogs';
import { users } from './identity';

/**
 * Clientes y sus contactos.
 *
 * `commercial_manager_user_id` reemplaza a la tabla `responsable_comercial` de
 * la v1, que existía solo para desacoplar el nombre del usuario comercial de la
 * tabla `usuario` — algo que `users.is_commercial_manager` ya resuelve. Un
 * cliente de la v1 con un responsable sin usuario resoluble (el caso real: 1 de
 * 49) migra con este campo en null, y el ETL lo informa.
 */

export const clientStatusEnum = pgEnum('client_status', ['active', 'inactive']);

export const clients = pgTable(
  'clients',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),

    companyName: varchar('company_name', { length: 200 }).notNull(),
    /** Segmento de URL amigable, generado del nombre al crear (ver `apps/api/src/shared/domain/slug.ts`) — no cambia si el nombre se edita después. */
    slug: varchar('slug', { length: 90 }).notNull(),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    taxId: varchar('tax_id', { length: 50 }).notNull(),
    website: varchar('website', { length: 255 }),
    address: varchar('address', { length: 300 }),
    /**
     * Logo como data URL (`data:image/png;base64,…`). El front lo reduce a un
     * tamaño chico antes de enviarlo, así que cabe holgado en la fila — el
     * proyecto no tiene almacenamiento de archivos y el logo se muestra
     * siempre junto al detalle del cliente.
     */
    logoDataUrl: text('logo_data_url'),

    countryId: uuid('country_id').references(() => countries.id, { onDelete: 'set null' }),
    comunaId: uuid('comuna_id').references(() => comunas.id, { onDelete: 'set null' }),
    industryId: uuid('industry_id').references(() => industries.id, { onDelete: 'set null' }),
    businessSectorId: uuid('business_sector_id').references(() => businessSectors.id, {
      onDelete: 'set null',
    }),

    commercialManagerUserId: uuid('commercial_manager_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    primaryContactId: uuid('primary_contact_id'),

    status: clientStatusEnum('status').notNull().default('active'),
    serviceStartDate: date('service_start_date', { mode: 'date' }),
    serviceEndDate: date('service_end_date', { mode: 'date' }),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('clients_tax_id_key')
      .on(table.taxId)
      .where(sql`${table.deletedAt} is null and ${table.taxId} <> ''`),
    uniqueIndex('clients_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    uniqueIndex('clients_slug_key').on(table.slug),
  ],
);

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    position: varchar('position', { length: 200 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('client_contacts_legacy_id_key')
      .on(table.legacyId)
      .where(sql`${table.legacyId} is not null`),
  ],
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
  country: one(countries, { fields: [clients.countryId], references: [countries.id] }),
  comuna: one(comunas, { fields: [clients.comunaId], references: [comunas.id] }),
  industry: one(industries, { fields: [clients.industryId], references: [industries.id] }),
  businessSector: one(businessSectors, {
    fields: [clients.businessSectorId],
    references: [businessSectors.id],
  }),
  commercialManager: one(users, {
    fields: [clients.commercialManagerUserId],
    references: [users.id],
  }),
  contacts: many(clientContacts),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
}));
