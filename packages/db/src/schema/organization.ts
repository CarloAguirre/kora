import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps } from './columns';

/**
 * Estructura organizativa: equipos y su composición.
 *
 * En la v1 esta información estaba repartida entre `lider_equipo` (el equipo),
 * `equipo_miembro` (la pertenencia, con el nombre del miembro duplicado como
 * texto) y `usuario.id_equipo` (la misma pertenencia otra vez). Tres lugares que
 * podían contradecirse. Aquí `team_members` es la única fuente de verdad de la
 * pertenencia y `users.team_id` guarda solo el equipo principal, derivado de ella.
 */

export const teamTypes = pgTable(
  'team_types',
  {
    id: primaryId(),
    name: varchar('name', { length: 60 }).notNull(),
    /** Hex `#RRGGBB`, elegido de una paleta fija en el frontend. */
    color: varchar('color', { length: 7 }).notNull(),
    /** Clave del set de íconos de tipo de equipo (frontend), p. ej. `code`, `palette`. */
    icon: varchar('icon', { length: 40 }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('team_types_name_key').on(sql`lower(btrim(${table.name}))`)],
);

export const teams = pgTable(
  'teams',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    /** Líder responsable. FK declarada en la migración para evitar el ciclo
     *  teams → users → teams a nivel de módulo TypeScript. */
    leaderUserId: uuid('leader_user_id'),
    /** Categoría visual del equipo (UX-UI, Desarrollo, QA, ...). Catálogo abierto: ver `team_types`. */
    teamTypeId: uuid('team_type_id').references(() => teamTypes.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('teams_name_key')
      .on(sql`lower(btrim(${table.name}))`)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('teams_legacy_id_key')
      .on(table.legacyId)
      .where(sql`${table.legacyId} is not null`),
    index('teams_leader_idx').on(table.leaderUserId),
    index('teams_team_type_idx').on(table.teamTypeId),
  ],
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    /** Cargo dentro del equipo (no es el rol de acceso al sistema). */
    position: varchar('position', { length: 120 }),
    /** Capacidad semanal comprometida; base del cálculo de disponibilidad. */
    weeklyHours: numeric('weekly_hours', { precision: 5, scale: 2 }).notNull().default('44'),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    // Una persona no puede estar dos veces activa en el mismo equipo, pero sí
    // puede haber pertenecido, salido y vuelto: el histórico se conserva.
    uniqueIndex('team_members_active_key')
      .on(table.teamId, table.userId)
      .where(sql`${table.leftAt} is null`),
    uniqueIndex('team_members_legacy_id_key')
      .on(table.legacyId)
      .where(sql`${table.legacyId} is not null`),
    index('team_members_user_idx').on(table.userId),
  ],
);

export const teamsRelations = relations(teams, ({ many, one }) => ({
  members: many(teamMembers),
  teamType: one(teamTypes, { fields: [teams.teamTypeId], references: [teamTypes.id] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
}));

export const teamTypesRelations = relations(teamTypes, ({ many }) => ({
  teams: many(teams),
}));
