import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { primaryId } from './columns';
import { auditActionEnum } from './enums';

/**
 * Bitácora de auditoría transversal.
 *
 * La v1 tenía historiales parciales y ad-hoc por módulo (`ticket_history`,
 * `forecast_asignacion_log`, `proyecto_participacion_historial`), cada uno con
 * columnas distintas, y nada para los cambios de usuario o de permisos —
 * justamente los más sensibles. Aquí hay un único registro append-only para
 * todo el sistema: quién, qué, sobre qué, antes y después.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),

    /**
     * `forecast_asignacion_log.id` de la v1, solo para las filas que escribe la
     * reimportación de forecast (`entity_type = 'forecast_assignment'`) — el resto
     * de los escritores de esta tabla la dejan en null. Permite upsert idempotente
     * en vez de duplicar el historial en cada reimportación.
     */
    legacyId: integer('legacy_id'),

    /** Nulo cuando el actor es el propio sistema (procesos, ETL, tareas). */
    actorUserId: uuid('actor_user_id'),
    /** Copia del correo del actor: si el usuario se borra, la traza sobrevive. */
    actorEmail: varchar('actor_email', { length: 255 }),

    action: auditActionEnum('action').notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }),

    /** Solo los campos que cambiaron, nunca secretos ni hashes. */
    changes: jsonb('changes').$type<Record<string, { before: unknown; after: unknown }>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    /** Correlaciona todos los eventos originados por una misma petición HTTP. */
    requestId: varchar('request_id', { length: 64 }),

    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_actor_idx').on(table.actorUserId),
    index('audit_log_occurred_at_idx').on(table.occurredAt),
    index('audit_log_action_idx').on(table.action),
    uniqueIndex('audit_log_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);
