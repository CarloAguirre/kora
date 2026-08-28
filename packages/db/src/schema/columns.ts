import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Fragmentos de columnas reutilizables.
 *
 * Toda tabla de negocio lleva las mismas marcas temporales y de autoría. En la
 * v1 esto era irregular (unas tablas tenían `created_at`, otras no, otras solo
 * `updated_at`), lo que hacía imposible auditar o depurar de forma uniforme.
 */

export const primaryId = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
};

/** Borrado lógico: nada se pierde, y las FKs históricas siguen resolviendo. */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
};
