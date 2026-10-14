import { sql } from 'drizzle-orm';
import { index, integer, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';

/**
 * Catálogos de referencia geográfica y de actividad económica.
 *
 * Son datos que casi nunca cambian y que consultan varios módulos (clientes hoy;
 * proyectos y facturación después), así que viven aparte de cualquier módulo de
 * negocio concreto. Se modelan como tablas y no como enums porque `comuna` tiene
 * 69 valores: una lista así pertenece a una tabla consultable, no a un tipo
 * TypeScript que hay que recompilar para editar.
 */

export const countries = pgTable(
  'countries',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    name: varchar('name', { length: 120 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('countries_name_key').on(sql`lower(btrim(${table.name}))`),
    uniqueIndex('countries_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);

/**
 * Comuna o ciudad. `countryId` permite que el formulario de cliente muestre solo
 * las del país elegido; es nullable porque v1 no guardaba esa relación y una
 * comuna cargada sin país no debe romper nada.
 */
export const comunas = pgTable(
  'comunas',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    name: varchar('name', { length: 120 }).notNull(),
    countryId: uuid('country_id').references(() => countries.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('comunas_country_id_idx').on(table.countryId),
    uniqueIndex('comunas_name_key').on(sql`lower(btrim(${table.name}))`),
    uniqueIndex('comunas_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);

/** Giro: rubro de actividad declarado del cliente (distinto de `businessSectors`). */
export const industries = pgTable(
  'industries',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    name: varchar('name', { length: 150 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('industries_name_key').on(sql`lower(btrim(${table.name}))`),
    uniqueIndex('industries_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);

/** Rubro comercial interno de Kora, usado para segmentar la cartera. */
export const businessSectors = pgTable(
  'business_sectors',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    name: varchar('name', { length: 150 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('business_sectors_name_key').on(sql`lower(btrim(${table.name}))`),
    uniqueIndex('business_sectors_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);
