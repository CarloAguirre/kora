import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps } from './columns';
import {
  identityProviderEnum,
  passwordAlgorithmEnum,
  permissionEffectEnum,
  sessionRevokeReasonEnum,
  userStatusEnum,
} from './enums';
import { teams } from './organization';

// ───────────────────────────── Catálogo de acceso ─────────────────────────────

export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    /** Código estable e inmutable usado por el código de la aplicación. */
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    /** Los roles del nivel administrativo comparten permisos entre sí. */
    isAdminTier: boolean('is_admin_tier').notNull().default(false),
    /** Un rol de sistema no se puede borrar desde la interfaz. */
    isSystem: boolean('is_system').notNull().default(true),
    /** Orden de presentación en los selectores. */
    displayOrder: integer('display_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex('roles_code_key').on(table.code)],
);

export const permissions = pgTable(
  'permissions',
  {
    id: primaryId(),
    /** Formato recurso:accion, por ejemplo users:create. */
    code: varchar('code', { length: 80 }).notNull(),
    resource: varchar('resource', { length: 40 }).notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    description: text('description'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('permissions_code_key').on(table.code),
    index('permissions_resource_idx').on(table.resource),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index('role_permissions_permission_idx').on(table.permissionId),
  ],
);

// ─────────────────────────────────── Usuarios ─────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: primaryId(),

    /**
     * Identificadores del sistema anterior. Los conserva el ETL para poder
     * reejecutar la migración sin duplicar, y para rastrear cualquier registro
     * histórico hasta su origen.
     */
    legacyId: integer('legacy_id'),
    legacyAuthUserId: uuid('legacy_auth_user_id'),

    email: varchar('email', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),

    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),

    status: userStatusEnum('status').notNull().default('active'),
    isCommercialManager: boolean('is_commercial_manager').notNull().default(false),

    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),

    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Unicidad insensible a mayúsculas y espacios: la misma regla que la v1
    // acabó necesitando (ux_usuario_correo_normalizado), pero desde el día uno
    // y sin depender de un trigger.
    uniqueIndex('users_email_key')
      .on(sql`lower(btrim(${table.email}))`)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('users_legacy_id_key')
      .on(table.legacyId)
      .where(sql`${table.legacyId} is not null`),
    uniqueIndex('users_legacy_auth_user_id_key')
      .on(table.legacyAuthUserId)
      .where(sql`${table.legacyAuthUserId} is not null`),
    index('users_role_idx').on(table.roleId),
    index('users_team_idx').on(table.teamId),
    index('users_status_idx').on(table.status),
    index('users_deleted_at_idx').on(table.deletedAt),
  ],
);

/**
 * Credenciales separadas de la identidad de negocio.
 *
 * Motivo (SRP): el perfil de un usuario se lee en decenas de pantallas; su
 * secreto de acceso no debe viajar en ninguna de esas consultas. Separarlo hace
 * imposible filtrar un hash por descuido en un select amplio, y permite que un
 * usuario exista sin cuenta de acceso — el caso de la mayoría de los 55
 * registros de `usuario` sin `auth_user_id` que tiene hoy la v1.
 */
export const userCredentials = pgTable(
  'user_credentials',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),

    passwordHash: text('password_hash'),
    passwordAlgorithm: passwordAlgorithmEnum('password_algorithm'),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true, mode: 'date' }),

    mustChangePassword: boolean('must_change_password').notNull().default(false),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),

    ...timestamps,
  },
  (table) => [index('user_credentials_locked_until_idx').on(table.lockedUntil)],
);

/** Proveedores de identidad externos (Google) y el enlace al Supabase heredado. */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProviderEnum('provider').notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('user_identities_provider_account_key').on(table.provider, table.providerAccountId),
    index('user_identities_user_idx').on(table.userId),
  ],
);

/**
 * Excepciones puntuales al permiso que otorga el rol.
 *
 * Existe para no tener que crear un rol nuevo cada vez que alguien necesita una
 * capacidad extra. `revoke` gana siempre sobre `grant`, y ambos sobre lo que
 * otorgue el rol.
 */
export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    effect: permissionEffectEnum('effect').notNull(),
    reason: text('reason'),
    grantedBy: uuid('granted_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.userId, table.permissionId] })],
);

// ─────────────────────────────────── Sesiones ─────────────────────────────────

/**
 * Un registro por refresh token emitido. Solo se guarda su hash: quien lea la
 * tabla no obtiene tokens usables. Permite cerrar sesión en un dispositivo
 * concreto, revocar todo tras un cambio de contraseña, y detectar reutilización
 * de tokens ya rotados (indicio de robo).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedReason: sessionRevokeReasonEnum('revoked_reason'),
    /** Sesión de la que ésta se rotó, para reconstruir la cadena ante un robo. */
    rotatedFromId: uuid('rotated_from_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_refresh_token_hash_key').on(table.refreshTokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    requestedIp: varchar('requested_ip', { length: 45 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('password_reset_tokens_hash_key').on(table.tokenHash),
    index('password_reset_tokens_user_idx').on(table.userId),
  ],
);

// ─────────────────────────────────── Relaciones ───────────────────────────────

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  overrides: many(userPermissionOverrides),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  team: one(teams, { fields: [users.teamId], references: [teams.id] }),
  credentials: one(userCredentials, {
    fields: [users.id],
    references: [userCredentials.userId],
  }),
  identities: many(userIdentities),
  permissionOverrides: many(userPermissionOverrides),
  sessions: many(sessions),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, { fields: [userCredentials.userId], references: [users.id] }),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, { fields: [userIdentities.userId], references: [users.id] }),
}));

export const userPermissionOverridesRelations = relations(userPermissionOverrides, ({ one }) => ({
  user: one(users, { fields: [userPermissionOverrides.userId], references: [users.id] }),
  permission: one(permissions, {
    fields: [userPermissionOverrides.permissionId],
    references: [permissions.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
