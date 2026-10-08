import { sql } from 'drizzle-orm';
import { boolean, date, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, integer } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { users } from './identity';
import { teamMembers } from './organization';
import { clients } from './clients';
import { projectModuleSegments, projectModuleTasks, projects } from './projects';

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

/** De dónde sale una fila: cargada a mano por el líder, o calculada desde un tramo del Roadmap o una tarea. */
export const forecastAssignmentSourceEnum = pgEnum('forecast_assignment_source', ['manual', 'segment', 'task']);

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

    source: forecastAssignmentSourceEnum('source').notNull().default('manual'),

    /** Tramo de ejecución del Roadmap que generó esta fila (`source = 'segment'`). Se va en cascada al borrar el tramo. */
    segmentId: uuid('segment_id').references(() => projectModuleSegments.id, { onDelete: 'cascade' }),
    /** Tarea que generó esta fila (`source = 'task'`). Se va en cascada al borrar la tarea. */
    taskId: uuid('task_id').references(() => projectModuleTasks.id, { onDelete: 'cascade' }),

    /**
     * Lo que dice el cálculo para esta fila — `null` en las manuales. Mientras la fila no esté
     * ajustada, `assignedHours` lo sigue; ver `ForecastSourceSyncService` y docs/DECISION-M6-FORECAST.md.
     */
    calculatedHours: numeric('calculated_hours', { precision: 6, scale: 2 }),
    /** El líder cambió las HH de una fila calculada: desde entonces el cálculo ya no toca `assignedHours`. */
    adjustedAt: timestamp('adjusted_at', { withTimezone: true, mode: 'date' }),
    adjustedByUserId: uuid('adjusted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** El cálculo cambió después del ajuste — el líder tiene que decidir si lo mantiene o usa el nuevo valor. */
    isStale: boolean('is_stale').notNull().default(false),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('forecast_assignments_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    index('forecast_assignments_member_period_idx').on(table.teamMemberId, table.periodStart, table.periodEnd),
    index('forecast_assignments_segment_idx').on(table.segmentId),
    index('forecast_assignments_task_idx').on(table.taskId),
  ],
);
