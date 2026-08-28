import type { Permission, RoleCode } from '@kora/contracts';

/**
 * Resuelve los permisos efectivos de un usuario: los de su rol, más las
 * concesiones puntuales, menos las revocaciones puntuales.
 */
export interface EffectivePermissions {
  readonly role: RoleCode;
  readonly permissions: readonly Permission[];
}

export interface PermissionReader {
  forUser(userId: string): Promise<EffectivePermissions | null>;
  forRole(role: RoleCode): Promise<readonly Permission[]>;
}

export const PERMISSION_READER = Symbol('PermissionReader');
