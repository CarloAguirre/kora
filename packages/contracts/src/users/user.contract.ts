import { z } from 'zod';
import {
  emailSchema,
  isoDateTimeSchema,
  nonEmptyTrimmed,
  pageSchema,
  paginationQuerySchema,
  sortDirectionSchema,
  uuidSchema,
} from '../common/primitives';
import { leaderProfileSchema, permissionSchema, roleCodeSchema } from './roles';

/** Estado de la cuenta. `blocked` lo pone el sistema (intentos fallidos);
 *  `disabled` es una decisión administrativa. Distinguirlos permite desbloquear
 *  sin reactivar a alguien que fue dado de baja. */
export const USER_STATUSES = ['active', 'disabled', 'blocked'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const USER_STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  active: 'Habilitado',
  disabled: 'Deshabilitado',
  blocked: 'Bloqueado',
};

// ─────────────────────────────── Lectura ────────────────────────────────

export const userTeamSchema = z.object({
  id: uuidSchema,
  name: z.string(),
});

export const userSummarySchema = z.object({
  id: uuidSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  role: roleCodeSchema,
  status: userStatusSchema,
  team: userTeamSchema.nullable(),
  isCommercialManager: z.boolean(),
  leaderProfile: leaderProfileSchema.nullable(),
  hasAccountAccess: z.boolean(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type UserSummary = z.infer<typeof userSummarySchema>;

export const userDetailSchema = userSummarySchema.extend({
  permissions: z.array(permissionSchema),
  mustChangePassword: z.boolean(),
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  lockedUntil: isoDateTimeSchema.nullable(),
  failedLoginAttempts: z.number().int().min(0),
  legacyId: z.number().int().nullable(),
  updatedAt: isoDateTimeSchema,
});

export type UserDetail = z.infer<typeof userDetailSchema>;

// ─────────────────────────────── Listado ────────────────────────────────

export const userSortFieldSchema = z.enum([
  'firstName',
  'lastName',
  'email',
  'role',
  'team',
  'status',
  'createdAt',
]);
export type UserSortField = z.infer<typeof userSortFieldSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  /** Búsqueda libre sobre nombre, apellido y correo. */
  search: z.string().trim().max(120).optional(),
  role: roleCodeSchema.optional(),
  status: userStatusSchema.optional(),
  teamId: uuidSchema.optional(),
  isCommercialManager: z.stringbool().optional(),
  sortField: userSortFieldSchema.default('firstName'),
  sortDirection: sortDirectionSchema.default('asc'),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listUsersResponseSchema = pageSchema(userSummarySchema);
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;

// ─────────────────────────────── Escritura ──────────────────────────────

export const createUserSchema = z.object({
  email: emailSchema,
  firstName: nonEmptyTrimmed(100, 'El nombre'),
  lastName: nonEmptyTrimmed(100, 'El apellido'),
  role: roleCodeSchema,
  teamId: uuidSchema.nullish(),
  isCommercialManager: z.boolean().default(false),
  /** Si es true se crea la cuenta de acceso y se envía la invitación. */
  grantAccess: z.boolean().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: nonEmptyTrimmed(100, 'El nombre').optional(),
  lastName: nonEmptyTrimmed(100, 'El apellido').optional(),
  email: emailSchema.optional(),
  role: roleCodeSchema.optional(),
  teamId: uuidSchema.nullish(),
  isCommercialManager: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changeUserStatusSchema = z.object({
  status: userStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;

/** Alta masiva: el back procesa todo o nada, para no dejar usuarios a medias. */
export const bulkCreateUsersSchema = z.object({
  users: z.array(createUserSchema).min(1).max(100),
});

export type BulkCreateUsersInput = z.infer<typeof bulkCreateUsersSchema>;

export const bulkCreateUsersResponseSchema = z.object({
  created: z.array(userSummarySchema),
});

export type BulkCreateUsersResponse = z.infer<typeof bulkCreateUsersResponseSchema>;
