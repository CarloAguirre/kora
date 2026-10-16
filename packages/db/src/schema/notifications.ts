import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { users } from './identity';

/**
 * Buzón de notificaciones dentro de Kora (la campanita de la barra superior).
 *
 * `type` es texto, no enum de base de datos: cada tipo trae su propio `data` y
 * se valida en los contratos, así agregar un tipo no exige migración.
 * `emailedAt` marca el correo de respaldo que sale si nadie la abrió a tiempo.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    title: text('title').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    emailedAt: timestamp('emailed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [index('notifications_user_created_idx').on(table.userId, table.createdAt)],
);
