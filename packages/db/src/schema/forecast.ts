import { sql } from 'drizzle-orm';
import { date, index, numeric, pgEnum, pgTable, text, uniqueIndex, uuid, integer } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { teamMembers } from './organization';
import { clients } from './clients';
import { projects } from './projects';

/** Ver docs/DECISION-M6-FORECAST.md. */

export const forecastAssignmentTypeEnum = pgEnum('forecast_assignment_type', [
  'project',
  'support',
  'vacation',
  'admin_day',
  'day_off',
  'sick_leave',
  'training',
  'other',
]);

/**
 * Asignación de un colaborador a un tipo de trabajo durante una semana
 * (siempre lunes a viernes). `'Sin asignación'` de la v1 no es un valor de
 * este enum: es una fila virtual que calcula la pantalla cuando quedan horas
 * libres, nunca se persiste.
 */
export const forecastAssignments = pgTable(
  'forecast_assignments',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),

    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),

    periodStart: date('period_start', { mode: 'date' }).notNull(),
    periodEnd: date('period_end', { mode: 'date' }).notNull(),

    type: forecastAssignmentTypeEnum('type').notNull(),
    /** Solo se usan cuando `type` es `project` o `support`. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),

    comments: text('comments').notNull().default(''),
    assignedHours: numeric('assigned_hours', { precision: 6, scale: 2 }).notNull().default('0'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('forecast_assignments_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    index('forecast_assignments_member_period_idx').on(table.teamMemberId, table.periodStart, table.periodEnd),
  ],
);
