import { relations, sql } from 'drizzle-orm';
import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps } from './columns';
import { clients } from './clients';
import { users } from './identity';
import { teamMembers, teams } from './organization';

/** Ver docs/DECISION-M3-ESTADOS.md: por qué son cuatro campos independientes. */
export const projectTypeEnum = pgEnum('project_type', ['development', 'support']);
export const projectSalesStageEnum = pgEnum('project_sales_stage', ['prospect', 'quoted', 'approved']);
export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'active',
  'on_hold',
  'finished',
  'cancelled',
]);
export const projectPhaseEnum = pgEnum('project_phase', [
  'discovery',
  'development',
  'testing',
  'pilot',
  'closed',
]);
export const projectPriorityEnum = pgEnum('project_priority', ['low', 'medium', 'high']);
export const participationTypeEnum = pgEnum('participation_type', ['team', 'project_leader']);

export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),

    name: varchar('name', { length: 300 }).notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    primaryContactId: uuid('primary_contact_id'),

    type: projectTypeEnum('type').notNull(),
    salesStage: projectSalesStageEnum('sales_stage'),
    status: projectStatusEnum('status').notNull().default('active'),
    phase: projectPhaseEnum('phase'),
    priority: projectPriorityEnum('priority'),

    leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
    developerUserId: uuid('developer_user_id').references(() => users.id, { onDelete: 'set null' }),
    commercialManagerUserId: uuid('commercial_manager_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    startDate: date('start_date', { mode: 'date' }),
    endDate: date('end_date', { mode: 'date' }),
    estimatedDeliveryDate: date('estimated_delivery_date', { mode: 'date' }),

    soldHours: numeric('sold_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    usedHours: numeric('used_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    expectedProgress: integer('expected_progress'),
    actualProgress: integer('actual_progress'),

    /** Compromiso de soporte declarado en el proyecto. La reconciliación financiera vive en M5. */
    supportPlanDescription: text('support_plan_description'),
    supportHours: numeric('support_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    overtimeRateUf: numeric('overtime_rate_uf', { precision: 10, scale: 4 }).notNull().default('0'),

    quotationLink: text('quotation_link'),
    contractLink: text('contract_link'),
    additionalLinks: text('additional_links'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    uniqueIndex('projects_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
    uniqueIndex('projects_client_name_key')
      .on(sql`coalesce(${table.clientId}::text, '-')`, sql`lower(btrim(${table.name}))`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

/** Equipos asignados a un proyecto, con su propio líder de proyecto. */
export const projectTeams = pgTable(
  'project_teams',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedHours: numeric('assigned_hours', { precision: 10, scale: 2 }),
    /** Conteo de colaboradores del equipo en este proyecto — no personas nombradas, ver `projectTeamMembers` para eso. */
    memberCount: integer('member_count'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('project_teams_project_team_key').on(table.projectId, table.teamId),
    uniqueIndex('project_teams_legacy_id_key').on(table.legacyId).where(sql`${table.legacyId} is not null`),
  ],
);

/** Miembro concreto asignado a trabajar en el proyecto, dentro de un equipo. */
export const projectTeamMembers = pgTable(
  'project_team_members',
  {
    id: primaryId(),
    legacyId: integer('legacy_id'),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
    activity: text('activity'),
    assignedHours: numeric('assigned_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    consumedHours: numeric('consumed_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('project_team_members_legacy_id_key')
      .on(table.legacyId)
      .where(sql`${table.legacyId} is not null`),
  ],
);

/** Histórico de entradas y salidas de personas y equipos de un proyecto. */
export const projectParticipationHistory = pgTable('project_participation_history', {
  id: primaryId(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  participationType: participationTypeEnum('participation_type').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
});

/** Observaciones/bitácora de proyecto. Sin adjuntos todavía: pendiente de Storage. */
export const projectObservations = pgTable('project_observations', {
  id: primaryId(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  ...timestamps,
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  leader: one(users, { fields: [projects.leaderUserId], references: [users.id] }),
  teams: many(projectTeams),
  members: many(projectTeamMembers),
  observations: many(projectObservations),
}));

export const projectTeamsRelations = relations(projectTeams, ({ one }) => ({
  project: one(projects, { fields: [projectTeams.projectId], references: [projects.id] }),
  team: one(teams, { fields: [projectTeams.teamId], references: [teams.id] }),
}));

export const projectTeamMembersRelations = relations(projectTeamMembers, ({ one }) => ({
  project: one(projects, { fields: [projectTeamMembers.projectId], references: [projects.id] }),
  team: one(teams, { fields: [projectTeamMembers.teamId], references: [teams.id] }),
}));

export const projectObservationsRelations = relations(projectObservations, ({ one }) => ({
  project: one(projects, { fields: [projectObservations.projectId], references: [projects.id] }),
}));
