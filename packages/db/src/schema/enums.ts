import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enums de la base v2.
 *
 * En la v1 estos valores eran `text` con CHECK constraints repartidos por 160
 * migraciones ('Habilitado'/'Deshabilitado'/'Bloqueado' en profiles, estados de
 * registro_hh en otro CHECK, etapas de proyecto en otro...). Como enum nativo
 * el conjunto de valores es único, consultable y el ORM lo tipa solo.
 */

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled', 'blocked']);

export const passwordAlgorithmEnum = pgEnum('password_algorithm', ['argon2id', 'bcrypt']);

export const permissionEffectEnum = pgEnum('permission_effect', ['grant', 'revoke']);

export const identityProviderEnum = pgEnum('identity_provider', ['password', 'google', 'legacy_supabase']);

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'restore',
  'status_change',
  'role_change',
  'login',
  'login_failed',
  'logout',
  'password_change',
  'password_reset_requested',
  'password_reset_completed',
  'access_granted',
  'access_revoked',
]);

export const sessionRevokeReasonEnum = pgEnum('session_revoke_reason', [
  'logout',
  'rotated',
  'password_changed',
  'status_changed',
  'admin_revoked',
  'expired',
]);
